-- ============================================================
-- F-0015 — Akce Lifecycle RPC functions
-- Datum:  2026-04-24
-- Autor:  Backend Agent (multi-agent orchestration, E-0002 F-0015)
-- Vstupy: artifacts/E-0002/F-0015-akce-lifecycle/01-product.md
--         artifacts/E-0002/F-0015-akce-lifecycle/02-decisions.md
--         artifacts/E-0002/F-0015-akce-lifecycle/03-architect.md
--         artifacts/E-0002/F-0015-akce-lifecycle/04-data.md
--
-- Data agent potvrdil: žádná schema migrace, enum constraints vyhovují.
-- Tato migrace obsahuje pouze 2 RPC funkce:
--   1) fn_zrusit_akci            — atomic transakce (update akce + prirazeni + historie)
--   2) fn_auto_ukoncit_probele_akce — atomic CTE pro auto-transition + audit
-- ============================================================

BEGIN;

-- ============================================================
-- 1) fn_zrusit_akci(p_akce_id, p_duvod, p_user_id) → jsonb
-- ============================================================
-- Guards:
--   - Hard block pokud existuje dochazka s odchod IS NOT NULL (INV-2)
--   - Idempotent: už zrušená akce → vrací {success:true, idempotent:true}
-- Side effects (ADR-1C):
--   - UPDATE akce SET stav='zrusena'
--   - UPDATE prirazeni SET status='vypadl' WHERE status != 'vypadl'
--   - INSERT historie (typ='akce_zrusena', metadata={duvod, prirazeni_count})
-- Return: jsonb { success, affected_prirazeni, idempotent? }
-- ============================================================

CREATE OR REPLACE FUNCTION fn_zrusit_akci(
  p_akce_id uuid,
  p_duvod   text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_stav   text;
  v_nazev  text;
  v_nabidka_id uuid;
  v_affected int := 0;
  v_has_completed boolean;
BEGIN
  -- Load akce + idempotency check
  SELECT stav, nazev, nabidka_id
  INTO v_stav, v_nazev, v_nabidka_id
  FROM akce WHERE id = p_akce_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AKCE_NOT_FOUND';
  END IF;

  IF v_stav = 'zrusena' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'affected_prirazeni', 0);
  END IF;

  -- Hard guard: dochazka s odchod IS NOT NULL
  SELECT EXISTS (
    SELECT 1 FROM dochazka d
    JOIN prirazeni p ON p.id = d.prirazeni_id
    WHERE p.akce_id = p_akce_id AND d.odchod IS NOT NULL
  ) INTO v_has_completed;

  IF v_has_completed THEN
    RAISE EXCEPTION 'HAS_COMPLETED_DOCHAZKA';
  END IF;

  -- Update akce
  UPDATE akce
  SET stav = 'zrusena', updated_at = NOW()
  WHERE id = p_akce_id;

  -- Bulk update prirazeni (INV-7 — skip already-vypadl rows)
  -- Poznámka: prirazeni tabulka nemá updated_at sloupec (viz initial_schema).
  WITH upd AS (
    UPDATE prirazeni
    SET status = 'vypadl'
    WHERE akce_id = p_akce_id AND status <> 'vypadl'
    RETURNING 1
  )
  SELECT count(*) INTO v_affected FROM upd;

  -- Audit (historie)
  INSERT INTO historie (akce_id, nabidka_id, user_id, typ, popis, metadata)
  VALUES (
    p_akce_id,
    v_nabidka_id,
    p_user_id,
    'akce_zrusena',
    'Akce "' || v_nazev || '" zrušena' ||
      CASE WHEN p_duvod IS NOT NULL AND p_duvod <> '' THEN '. Důvod: ' || p_duvod ELSE '' END,
    jsonb_build_object('duvod', p_duvod, 'prirazeni_count', v_affected)
  );

  RETURN jsonb_build_object(
    'success', true,
    'affected_prirazeni', v_affected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_zrusit_akci(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 2) fn_auto_ukoncit_probele_akce() → int
-- ============================================================
-- Atomic CTE dle D-F0015-10:
--   - UPDATE akce ... RETURNING (atomic per-row, žádné race)
--   - INSERT historie v jedné CTE — žádná duplicate audit
-- Guards:
--   - stav='planovana' AND datum < CURRENT_DATE
--   - EXISTS dochazka.odchod IS NOT NULL pro některé prirazeni
--   - NOT EXISTS historie typ='akce_reopen' v posledních 10 min (D-F0015-09)
-- user_id = NULL pro system audit (D-02)
-- Return: počet ukončených akcí
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_ukoncit_probele_akce()
RETURNS int
LANGUAGE sql
AS $$
  WITH flipped AS (
    UPDATE akce
    SET stav = 'probehla', updated_at = NOW()
    WHERE stav = 'planovana'
      AND datum < CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM dochazka d
        JOIN prirazeni p ON p.id = d.prirazeni_id
        WHERE p.akce_id = akce.id AND d.odchod IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM historie h
        WHERE h.akce_id = akce.id
          AND h.typ = 'akce_reopen'
          AND h.created_at > NOW() - INTERVAL '10 minutes'
      )
    RETURNING id, nazev, datum, nabidka_id
  ),
  audit AS (
    INSERT INTO historie (akce_id, nabidka_id, typ, popis, user_id)
    SELECT
      id,
      nabidka_id,
      'akce_auto_ukoncena',
      'Automaticky ukončena: ' || nazev || ' (' || datum || ')',
      NULL
    FROM flipped
    RETURNING 1
  )
  SELECT count(*)::int FROM audit;
$$;

GRANT EXECUTE ON FUNCTION fn_auto_ukoncit_probele_akce() TO authenticated;

COMMIT;
