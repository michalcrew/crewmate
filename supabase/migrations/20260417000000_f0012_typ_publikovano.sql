-- Migration: F-0012 — Typy zakázek (jednodenni/opakovana/ukoncena) + publikovano flag
-- Date: 2026-04-17
-- Author: Orchestrated multi-agent delivery (Architect + Backend + Security)
--
-- Changes:
--   1) nabidky.typ: jednorazova/prubezna → jednodenni/opakovana (rename)
--      + absorbs stav='ukoncena' as a typ value
--   2) nabidky.zverejnena → renamed to publikovano
--   3) nabidky.stav column dropped
--   4) CHECK: typ='ukoncena' ⇒ publikovano=false
--   5) akce.nabidka_id: ON DELETE SET NULL → ON DELETE RESTRICT
--   6) RLS policy public_read_nabidky updated
--   7) Briefing email template seed

BEGIN;

-- ============================================================
-- 1) Drop dependent RLS policy and old CHECK on typ
-- ============================================================
DROP POLICY IF EXISTS "public_read_nabidky" ON nabidky;

ALTER TABLE nabidky DROP CONSTRAINT IF EXISTS nabidky_typ_check;

-- ============================================================
-- 2) Rename zverejnena → publikovano
-- ============================================================
ALTER TABLE nabidky RENAME COLUMN zverejnena TO publikovano;

-- ============================================================
-- 3) Backfill typ values
--    Handles BOTH schema variants that exist in the wild:
--      - jednorazova / prubezna (newer migration)
--      - aktivni / stala (older prod schema)
--    All normalize to jednodenni / opakovana.
--    stav='ukoncena' → typ='ukoncena' (overrides whatever typ was)
-- ============================================================
UPDATE nabidky SET typ = 'jednodenni' WHERE typ IN ('jednorazova', 'aktivni');
UPDATE nabidky SET typ = 'opakovana'  WHERE typ IN ('prubezna', 'stala');
UPDATE nabidky SET typ = 'ukoncena', publikovano = false WHERE stav = 'ukoncena';

-- ============================================================
-- 4) Drop stav column (replaced by typ + publikovano)
-- ============================================================
DROP INDEX IF EXISTS idx_nabidky_stav;
ALTER TABLE nabidky DROP COLUMN IF EXISTS stav;

-- ============================================================
-- 5) New CHECK constraints
-- ============================================================
ALTER TABLE nabidky
  ADD CONSTRAINT nabidky_typ_check
  CHECK (typ IN ('jednodenni', 'opakovana', 'ukoncena'));

ALTER TABLE nabidky
  ADD CONSTRAINT nabidky_ukoncena_unpublished
  CHECK (typ <> 'ukoncena' OR publikovano = false);

-- ============================================================
-- 6) Index for public /prace query
-- ============================================================
DROP INDEX IF EXISTS idx_nabidky_zverejnena;
CREATE INDEX IF NOT EXISTS idx_nabidky_publikovano
  ON nabidky (publikovano, typ)
  WHERE publikovano = true;

-- ============================================================
-- 7) akce.nabidka_id: SET NULL → RESTRICT
--    Ensures no accidental cascade of nabidka deletion leaves dangling akce
-- ============================================================
DO $$
DECLARE
  constraint_name_var text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name_var
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'akce'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'nabidka_id'
  LIMIT 1;

  IF constraint_name_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE akce DROP CONSTRAINT %I', constraint_name_var);
  END IF;

  ALTER TABLE akce
    ADD CONSTRAINT akce_nabidka_id_fkey
    FOREIGN KEY (nabidka_id) REFERENCES nabidky(id) ON DELETE RESTRICT;
END $$;

-- ============================================================
-- 8) RLS policy: anon sees only publikovano=true AND typ in (jednodenni, opakovana)
-- ============================================================
CREATE POLICY "public_read_nabidky" ON nabidky FOR SELECT TO anon
  USING (publikovano = true AND typ IN ('jednodenni', 'opakovana'));

-- ============================================================
-- 9) Ensure prirazeni UNIQUE constraint (should already exist; idempotent guard)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'prirazeni'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'prirazeni_unique_akce_brigadnik'
  ) THEN
    ALTER TABLE prirazeni
      ADD CONSTRAINT prirazeni_unique_akce_brigadnik
      UNIQUE (akce_id, brigadnik_id);
  END IF;
END $$;

-- ============================================================
-- 10) Seed briefing email template (idempotent by nazev)
-- ============================================================
INSERT INTO email_sablony (nazev, predmet, obsah_html, typ, aktivni)
SELECT
  'Briefing pro akci',
  'Briefing: {{akce_nazev}} — {{akce_datum}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Ahoj {{jmeno}},</h2>
<p>posíláme briefing k akci <strong>{{akce_nazev}}</strong>.</p>
<div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
<p style="margin: 0 0 4px 0;"><strong>Datum:</strong> {{akce_datum}}</p>
<p style="margin: 0 0 4px 0;"><strong>Místo:</strong> {{akce_misto}}</p>
<p style="margin: 0 0 4px 0;"><strong>Pozice:</strong> {{pozice}}</p>
</div>
<p>{{briefing_text}}</p>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>',
  'vlastni',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_sablony WHERE nazev = 'Briefing pro akci');

-- ============================================================
-- 11) Comments
-- ============================================================
COMMENT ON COLUMN nabidky.typ IS 'F-0012: jednodenni = 1:1 s akcí, opakovana = 1:N akcí, ukoncena = read-only archiv. Po vytvoření immutable (app-level guard).';
COMMENT ON COLUMN nabidky.publikovano IS 'F-0012: Viditelná na /prace. typ=ukoncena vynucuje publikovano=false (CHECK).';

COMMIT;
