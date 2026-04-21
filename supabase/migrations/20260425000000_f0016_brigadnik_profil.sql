-- ============================================================
-- F-0016 — Brigádník profil rozšíření
-- Datum:  2026-04-25
-- Autor:  Data Agent (multi-agent orchestration, E-0002 F-0016)
-- Vstupy: .agents/artifacts/E-0002/F-0016-brigadnik-profil/01-product.md
--         .agents/artifacts/E-0002/F-0016-brigadnik-profil/02-decisions.md
--         .agents/artifacts/E-0002/F-0016-brigadnik-profil/04-data.md
--
-- Scope této migrace:
--   1) Nová tabulka hodnoceni_brigadnika (US-1C-1, US-1C-2)
--   2) Rozšíření v_brigadnici_aktualni o sloupec hodiny_rok + přepočet
--      prumerne_hodnoceni z UNION (dochazka + hodnoceni_brigadnika)
--   3) Sanity check: pipeline_entries.poznamky už existuje (initial_schema)
--   4) Nový sloupec brigadnici.deleted_at (D-F0016-06 soft-delete)
--   5) RLS policies pro hodnoceni_brigadnika (všichni authenticated, D-F0016-04=C)
--
-- Dependencies: F-0013 (v_brigadnici_aktualni nová forma s rok join)
--               F-0015 (žádný overlap, tato migrace běží PO ní)
--
-- Destruktivní operace: žádná. Pouze additivní změny + DROP+RECREATE view.
-- ============================================================

BEGIN;

-- ============================================================
-- 0) Sanity belt-and-suspenders: pipeline_entries.poznamky
-- ============================================================
-- Product 02-decisions.md D-F0016-02 spoléhá na sloupec poznamky
-- v pipeline_entries. Sloupec už existuje z initial_schema (2026-04-15),
-- ale raději IF NOT EXISTS idempotentně. Kdyby někdo v budoucnu
-- omylem dropnul, tato migrace ho obnoví.
-- ============================================================

ALTER TABLE pipeline_entries
  ADD COLUMN IF NOT EXISTS poznamky text;

COMMENT ON COLUMN pipeline_entries.poznamky IS
  'F-0016 US-1E-1: Poznámka náborářky k brigádníkovi v kontextu zakázky. Zobrazena v AssignmentMatrix row (hover tooltip / click popover). Scratchpad, není audited.';


-- ============================================================
-- 1) brigadnici.deleted_at — soft-delete sloupec
-- ============================================================
-- D-F0016-06: Soft-deleted brigádníci se skrývají z listu.
-- V initial_schema sloupec neexistoval (ověřeno grepem). Přidáváme ho
-- NULLABLE + částečný index pro rychlé WHERE deleted_at IS NULL
-- (default filtr). Vlastní soft-delete akce bude v Backend agent (action
-- soft-delete: UPDATE brigadnici SET deleted_at = NOW() WHERE id = ?).
--
-- Dependency: v_brigadnici_aktualni má WHERE aktivni = true, takže
-- deleted_at nový sloupec view nekoliduje (nový view z tohoto migrate
-- přidá AND deleted_at IS NULL pro explicitní GDPR filter).
-- ============================================================

ALTER TABLE brigadnici
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Partial index pro default filtr (WHERE deleted_at IS NULL) — většina
-- dotazů bude filtrovat právě na aktivní (ne-soft-deleted) brigádníky.
CREATE INDEX IF NOT EXISTS idx_brigadnici_deleted_at_null
  ON brigadnici (id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN brigadnici.deleted_at IS
  'F-0016 D-F0016-06: Soft-delete timestamp. NULL = aktivní, NOT NULL = skryto z listu/matrixu. GDPR friendly — data zůstávají pro audit, ale UI je neukazuje.';


-- ============================================================
-- 2) Nová tabulka: hodnoceni_brigadnika
-- ============================================================
-- US-1C-1: Hodnocení i bez vazby na konkrétní akci (akce_id NULLABLE).
-- FK rules (02-decisions.md):
--   - brigadnik_id     ON DELETE RESTRICT — nelze smazat brigádníka s hodnocením
--                      (jde pouze přes soft-delete deleted_at)
--   - akce_id          ON DELETE SET NULL — akce smazaná → hodnocení zůstává
--                      s akce_id=NULL (UI zobrazí „— bez akce —")
--   - hodnotil_user_id ON DELETE SET NULL — smazaný user → „Smazaný uživatel"
--                      (D-F0016-05)
-- CHECK: hodnoceni BETWEEN 1 AND 5.
-- poznamka: TEXT NULL, max délka vynucena v Zod/UI (500 znaků), ne v DB.
-- ============================================================

CREATE TABLE IF NOT EXISTS hodnoceni_brigadnika (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id      uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  akce_id           uuid NULL     REFERENCES akce(id)       ON DELETE SET NULL,
  hodnoceni         integer NOT NULL CHECK (hodnoceni BETWEEN 1 AND 5),
  poznamka          text NULL,
  hodnotil_user_id  uuid NULL     REFERENCES users(id)      ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexy pro listing v detailu brigádníka + agregace do v_brigadnici_aktualni
CREATE INDEX IF NOT EXISTS idx_hodnoceni_brigadnika_brigadnik
  ON hodnoceni_brigadnika (brigadnik_id);

CREATE INDEX IF NOT EXISTS idx_hodnoceni_brigadnika_akce
  ON hodnoceni_brigadnika (akce_id)
  WHERE akce_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hodnoceni_brigadnika_created
  ON hodnoceni_brigadnika (created_at DESC);

-- updated_at trigger — reuse existující update_updated_at() z initial_schema
CREATE TRIGGER set_updated_at_hodnoceni_brigadnika
  BEFORE UPDATE ON hodnoceni_brigadnika
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE hodnoceni_brigadnika IS
  'F-0016 US-1C-1: Hodnocení brigádníka (1-5 hvězd) bez nutnosti vazby na docházku. Akce volitelná (náborář hodnotí i z pohovoru). Druhý zdroj AVG hodnocení v v_brigadnici_aktualni (první je dochazka.hodnoceni).';

COMMENT ON COLUMN hodnoceni_brigadnika.akce_id IS
  'Volitelná vazba na akci. NULL = globální hodnocení (z pohovoru, briefingu). ON DELETE SET NULL — akce smazaná, hodnocení zůstává.';

COMMENT ON COLUMN hodnoceni_brigadnika.hodnotil_user_id IS
  'Autor hodnocení. ON DELETE SET NULL (D-F0016-05): pokud se user smaže, UI zobrazí „Smazaný uživatel" a nikdo nemůže hodnocení editovat.';


-- ============================================================
-- 3) RLS pro hodnoceni_brigadnika
-- ============================================================
-- D-F0016-04 (volba C): VŠICHNI authenticated smí CRUD bez autor/admin
-- guardu. Tým si důvěřuje, žádná granularita.
-- ============================================================

ALTER TABLE hodnoceni_brigadnika ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_hodnoceni_brigadnika"
  ON hodnoceni_brigadnika FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_hodnoceni_brigadnika"
  ON hodnoceni_brigadnika FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_hodnoceni_brigadnika"
  ON hodnoceni_brigadnika FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_hodnoceni_brigadnika"
  ON hodnoceni_brigadnika FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 4) v_brigadnici_aktualni — rozšíření (DROP + CREATE)
-- ============================================================
-- Důvod DROP + CREATE: měníme signaturu (nový sloupec hodiny_rok,
-- změna definice prumerne_hodnoceni z dochazka-only na UNION s
-- hodnoceni_brigadnika). CREATE OR REPLACE VIEW v Postgres nefunguje
-- pokud se mění sloupce (PostgreSQL quirk — column order + type musí
-- zůstat, jen přidání na konec).
--
-- Abychom byli safe: DROP, CREATE, znovu security_invoker=true (F-0013
-- security addendum pattern).
--
-- Nové sloupce:
--   hodiny_rok INT — SUM(dochazka.hodin_celkem) za aktuální kalendářní
--                     rok podle akce.datum. JOIN přes prirazeni.
--                     US-1F-1 matrix row + US-1G-1 list sloupec.
--                     Zaokrouhleno na celé hodiny (UI-level display).
--   prumerne_hodnoceni NUMERIC(3,2) — AVG UNION
--                     (dochazka.hodnoceni + hodnoceni_brigadnika.hodnoceni)
--                     per brigadnik. Oba zdroje váha 1 (každý záznam stejně).
--
-- Zachování kompatibility:
--   - dpp_stav, prohlaseni_stav, pocet_akci zůstávají beze změny
--   - b.* zůstává (SELECT všech sloupců brigadnici včetně nového deleted_at)
--   - WHERE aktivni = true zůstává; navíc přidán AND deleted_at IS NULL
--     (D-F0016-06 — view by nikdy neměla zobrazit soft-deleted)
-- ============================================================

-- DROP nezávislosti: žádný code-consumer view (v_mesicni_dochazka a
-- v_chybejici_dpp nečtou z v_brigadnici_aktualni). Grep v migraci ověřil.
DROP VIEW IF EXISTS v_brigadnici_aktualni;

CREATE VIEW v_brigadnici_aktualni AS
SELECT
  b.*,
  ss.dpp_stav,
  ss.prohlaseni_stav,
  COALESCE(stats.prumerne_hodnoceni, 0)::numeric(3,2) AS prumerne_hodnoceni,
  COALESCE(stats.pocet_hodnoceni, 0)                  AS pocet_hodnoceni,
  COALESCE(stats.pocet_akci, 0)                       AS pocet_akci,
  COALESCE(hodiny.hodiny_rok, 0)::int                 AS hodiny_rok
FROM brigadnici b
LEFT JOIN smluvni_stav ss
       ON ss.brigadnik_id = b.id
      AND ss.rok = EXTRACT(YEAR FROM CURRENT_DATE)::int
LEFT JOIN (
  -- AVG přes UNION obou zdrojů hodnocení.
  -- Váha: každý záznam = 1 (10 docházkových hodnocení + 2 ruční = AVG přes 12).
  SELECT
    brigadnik_id,
    AVG(hodnoceni)::numeric(3,2) AS prumerne_hodnoceni,
    COUNT(*)                     AS pocet_hodnoceni,
    COUNT(DISTINCT akce_id) FILTER (WHERE akce_id IS NOT NULL) AS pocet_akci
  FROM (
    SELECT brigadnik_id, hodnoceni, akce_id
    FROM dochazka
    WHERE hodnoceni IS NOT NULL
    UNION ALL
    SELECT brigadnik_id, hodnoceni, akce_id
    FROM hodnoceni_brigadnika
  ) combined
  GROUP BY brigadnik_id
) stats ON stats.brigadnik_id = b.id
LEFT JOIN (
  -- Hodiny za aktuální kalendářní rok (D-F0016-03).
  -- JOIN přes prirazeni × akce; filtr EXTRACT(YEAR FROM akce.datum).
  SELECT
    p.brigadnik_id,
    SUM(d.hodin_celkem)::numeric AS hodiny_rok
  FROM dochazka d
  JOIN prirazeni p ON p.id = d.prirazeni_id
  JOIN akce a      ON a.id = d.akce_id
  WHERE EXTRACT(YEAR FROM a.datum)::int = EXTRACT(YEAR FROM CURRENT_DATE)::int
    AND d.hodin_celkem IS NOT NULL
  GROUP BY p.brigadnik_id
) hodiny ON hodiny.brigadnik_id = b.id
WHERE b.aktivni = true
  AND b.deleted_at IS NULL;  -- D-F0016-06: soft-delete out of scope

-- F-0013 security addendum: security_invoker=true aby view respektovala
-- RLS volajícího. Konzistence s v_brigadnik_zakazka_status a v_chybejici_dpp.
ALTER VIEW v_brigadnici_aktualni SET (security_invoker = true);

COMMENT ON VIEW v_brigadnici_aktualni IS
  'F-0016: rozšířeno o hodiny_rok (SUM dochazka za aktuální kalendářní rok) a prumerne_hodnoceni (AVG UNION dochazka + hodnoceni_brigadnika). Filtruje deleted_at IS NULL (D-F0016-06).';


-- ============================================================
-- 5) Audit: historie typ hinty pro F-0016 operace
-- ============================================================
-- Žádné schema změny, jen rozšíření COMMENTu o nové typy (konzistentní s kódem
-- v lib/actions/brigadnici.ts a lib/actions/hodnoceni.ts):
--   - 'brigadnik_osobni_udaje_change' — diff audit z updateBrigadnikOsobniUdaje() (US-1B-1)
--   - 'brigadnik_typ_zmena'           — změna typ_brigadnika (metadata: { before, after })
--   - 'brigadnik_osvc_field_zmena'    — změna OSVČ polí
--   - 'hodnoceni_pridano'             — addHodnoceni()
--   - 'hodnoceni_upraveno'            — updateHodnoceni()
--   - 'hodnoceni_smazano'             — deleteHodnoceni() (snapshot v metadata)
-- ============================================================

COMMENT ON COLUMN historie.typ IS
  'Values: pipeline_zmena, email_odeslan, dotaznik_vyplnen, dpp_vygenerovano, dokument_nahran, prirazeni_zmena, dochazka_zapsana, smluvni_stav_archiv_f0013, akce_zrusena, brigadnik_osobni_udaje_change, brigadnik_typ_zmena, brigadnik_osvc_field_zmena, hodnoceni_pridano, hodnoceni_upraveno, hodnoceni_smazano';


COMMIT;

-- ============================================================
-- Rollback plan (ruční, not committed):
--   BEGIN;
--   DROP VIEW IF EXISTS v_brigadnici_aktualni;
--   -- Re-create starou formu (F-0013 verze bez hodiny_rok):
--   CREATE VIEW v_brigadnici_aktualni AS ... (viz 20260422000000);
--   ALTER VIEW v_brigadnici_aktualni SET (security_invoker = true);
--
--   DROP TABLE IF EXISTS hodnoceni_brigadnika CASCADE;
--   ALTER TABLE brigadnici DROP COLUMN IF EXISTS deleted_at;
--   DROP INDEX IF EXISTS idx_brigadnici_deleted_at_null;
--   -- pipeline_entries.poznamky NIKDY nedropovat (initial_schema sloupec).
--   COMMIT;
-- ============================================================
