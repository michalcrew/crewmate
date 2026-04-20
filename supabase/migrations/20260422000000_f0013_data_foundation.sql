-- ============================================================
-- F-0013 — Data Foundation
-- Datum:  2026-04-22
-- Autor:  Data Agent (multi-agent orchestration, E-0002 F-0013)
-- Vstupy: artifacts/E-0002/F-0013-data-foundation/01-product.md
--         artifacts/E-0002/F-0013-data-foundation/02-decisions.md
--         artifacts/E-0002/F-0013-data-foundation/04-data.md
-- Závisí na všech předchozích migracích:
--   20260415000000_initial_schema.sql
--   20260416000000_nabidky_new_fields.sql
--   20260416100000_missing_tables.sql
--   20260416200000_adresa_fields.sql
--   20260416300000_email_feature.sql
--   20260417000000_email_templates_seed.sql
--   20260417000000_f0012_typ_publikovano.sql
--   20260421000000_hotfix_diakritika_pozic.sql
--
-- Obsah migrace:
--   1) brigadnici: přidání IČAŘ/OSVČ polí, narodnost, chce_ruzove_prohlaseni
--                  drop student / nazev_skoly / uplatnuje_slevu_jinde
--   2) users: sloupec podpis
--   3) email_sablony: platnost_od / platnost_do + CHECK
--   4) smluvni_stav: per-měsíc → per-rok (archiv do historie, konsolidace,
--                    drop mesic, add rok+platnost_do, rozšířit dpp_stav o 'ukoncena')
--   5) VIEW v_brigadnik_zakazka_status (6-hodnotový dokumentační status)
--   6) Regenerace závislých VIEWs (v_brigadnici_aktualni, v_chybejici_dpp)
--
-- RLS: žádné změny — nové sloupce dědí existující politiky
-- ============================================================

BEGIN;

-- ============================================================
-- 1. brigadnici: IČAŘ/OSVČ větev + narodnost + ruzove_prohlaseni
--    + DROP starých nepoužívaných polí (user-approved data loss)
-- ============================================================

-- 1.1. Nové sloupce
ALTER TABLE brigadnici
  ADD COLUMN IF NOT EXISTS typ_brigadnika text NOT NULL DEFAULT 'brigadnik';

ALTER TABLE brigadnici
  ADD COLUMN IF NOT EXISTS osvc_ico              text,
  ADD COLUMN IF NOT EXISTS osvc_dic              text,  -- šifrováno app layer (AES-256-GCM, D-F0013-05)
  ADD COLUMN IF NOT EXISTS osvc_fakturacni_adresa text,
  ADD COLUMN IF NOT EXISTS narodnost             text,
  ADD COLUMN IF NOT EXISTS chce_ruzove_prohlaseni boolean NOT NULL DEFAULT false;

-- 1.2. CHECK: typ_brigadnika je enum
ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_typ_brigadnika_check;
ALTER TABLE brigadnici
  ADD CONSTRAINT brigadnici_typ_brigadnika_check
  CHECK (typ_brigadnika IN ('brigadnik', 'osvc'));

-- 1.3. CHECK: OSVČ musí mít IČO (DB-side guard; Zod to validuje na app layer první)
ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_osvc_ico_required;
ALTER TABLE brigadnici
  ADD CONSTRAINT brigadnici_osvc_ico_required
  CHECK (typ_brigadnika <> 'osvc' OR osvc_ico IS NOT NULL);

-- 1.4. Drop starých polí (uživatelem schválená ztráta dat — viz epic brief sekce 2)
ALTER TABLE brigadnici
  DROP COLUMN IF EXISTS student,
  DROP COLUMN IF EXISTS nazev_skoly,
  DROP COLUMN IF EXISTS uplatnuje_slevu_jinde;

-- 1.5. Partial index pro rychlé vyhledávání OSVČ v reportech
CREATE INDEX IF NOT EXISTS idx_brigadnici_typ_brigadnika_osvc
  ON brigadnici (typ_brigadnika)
  WHERE typ_brigadnika = 'osvc';

COMMENT ON COLUMN brigadnici.typ_brigadnika IS
  'F-0013: brigadnik = klasický DPP, osvc = fakturuje přes IČO. OSVČ override v v_brigadnik_zakazka_status.';
COMMENT ON COLUMN brigadnici.osvc_ico IS
  'F-0013: IČO OSVČ. Veřejné (ARES) — neencryptovat. Povinné pokud typ_brigadnika=osvc.';
COMMENT ON COLUMN brigadnici.osvc_dic IS
  'F-0013: DIČ OSVČ. Pro FO obsahuje RČ → šifrováno AES-256-GCM na app layer (D-F0013-05).';
COMMENT ON COLUMN brigadnici.osvc_fakturacni_adresa IS
  'F-0013: Fakturační adresa OSVČ. Plain text, ne šifrované (D-F0013-08).';
COMMENT ON COLUMN brigadnici.narodnost IS
  'F-0013: Národnost pro DPP. Výčet viz D-F0013-04 (CZ, SK, UA, ... + "Jiná").';
COMMENT ON COLUMN brigadnici.chce_ruzove_prohlaseni IS
  'F-0013: Přání brigádníka o sleva-na-dani prohlášení. Default false.';


-- ============================================================
-- 2. users.podpis — per-user email podpis (F-0014 consumer)
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS podpis text;

COMMENT ON COLUMN users.podpis IS
  'F-0013: Per-user email podpis (plain text + omezený HTML allowlist). Sanitizuje se v Server Action updateUserPodpis. Max 1000 znaků (Zod).';


-- ============================================================
-- 3. email_sablony: platnost_od / platnost_do (konzistence s dokument_sablony)
-- ============================================================

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS platnost_od date,
  ADD COLUMN IF NOT EXISTS platnost_do date;

ALTER TABLE email_sablony DROP CONSTRAINT IF EXISTS email_sablony_platnost_valid;
ALTER TABLE email_sablony
  ADD CONSTRAINT email_sablony_platnost_valid
  CHECK (platnost_od IS NULL OR platnost_do IS NULL OR platnost_od <= platnost_do);

COMMENT ON COLUMN email_sablony.platnost_od IS 'F-0013: Od kdy je šablona aktivní. NULL = neomezená.';
COMMENT ON COLUMN email_sablony.platnost_do IS 'F-0013: Do kdy je šablona aktivní. NULL = neomezená.';


-- ============================================================
-- 4. smluvni_stav: per-měsíc → per-rok (D-F0013-01, D-F0013-07, D-F0013-10)
-- ============================================================

-- 4.0. DROP závislé VIEWs (budou re-createnuté v sekci 6)
--      Nemohou žít, pokud smluvni_stav.mesic zmizí.
DROP VIEW IF EXISTS v_chybejici_dpp;
DROP VIEW IF EXISTS v_brigadnici_aktualni;

-- 4.1. Archivace per-měsíc snapshotů do historie (D-F0013-01)
--      Každý řádek smluvni_stav → 1 řádek historie typ='smluvni_stav_archiv_f0013'.
--      Umožní rollback a forensic audit.
--      SAFETY: idempotence — pokud migrace poběží podruhé, zduplikuje archiv.
--      Tomu předejde kontrola NOT EXISTS na typ='smluvni_stav_archiv_f0013'.
INSERT INTO historie (brigadnik_id, typ, popis, metadata, created_at)
SELECT
  s.brigadnik_id,
  'smluvni_stav_archiv_f0013',
  'Archiv per-měsíc smluvni_stav záznamu před konsolidací na per-rok (F-0013)',
  row_to_json(s.*)::jsonb,
  s.created_at
FROM smluvni_stav s
WHERE NOT EXISTS (
  SELECT 1 FROM historie h
  WHERE h.typ = 'smluvni_stav_archiv_f0013'
    AND h.brigadnik_id = s.brigadnik_id
    AND (h.metadata->>'id')::uuid = s.id
);

-- 4.2. Staging: vypočti per-rok agregované řádky do TEMP tabulky
--      Severity ordinal pro dpp_stav / prohlaseni_stav:
--        zadny=0, vygenerovano=1, odeslano=2, ukoncena=2, podepsano=3
--      SAFETY: 'ukoncena' je úmyslně NIŽŠÍ severity než 'podepsano' — v edge case
--      kdy brigádník má v jednom roce obojí (např. DPP 2025-04 podepsaná a 2025-11
--      ukončená), vyhraje 'podepsano' jako sémanticky "aktivní". Auto-flip na
--      'ukoncena' po 31.12. řeší backend batch job (D-F0013-10).
CREATE TEMP TABLE _f0013_smluvni_stav_new ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    s.*,
    EXTRACT(YEAR FROM s.mesic)::int AS rok_computed,
    CASE s.dpp_stav
      WHEN 'zadny'        THEN 0
      WHEN 'vygenerovano' THEN 1
      WHEN 'odeslano'     THEN 2
      WHEN 'ukoncena'     THEN 2  -- pro budoucí kompat; dnes CHECK to ani nedovolí
      WHEN 'podepsano'    THEN 3
      ELSE 0
    END AS dpp_severity,
    CASE s.prohlaseni_stav
      WHEN 'zadny'        THEN 0
      WHEN 'vygenerovano' THEN 1
      WHEN 'odeslano'     THEN 2
      WHEN 'podepsano'    THEN 3
      ELSE 0
    END AS prohl_severity,
    ROW_NUMBER() OVER (
      PARTITION BY s.brigadnik_id, EXTRACT(YEAR FROM s.mesic)
      ORDER BY
        CASE s.dpp_stav
          WHEN 'podepsano'    THEN 3
          WHEN 'odeslano'     THEN 2
          WHEN 'ukoncena'     THEN 2
          WHEN 'vygenerovano' THEN 1
          ELSE 0
        END DESC,
        s.updated_at DESC NULLS LAST
    ) AS rn_dpp,
    ROW_NUMBER() OVER (
      PARTITION BY s.brigadnik_id, EXTRACT(YEAR FROM s.mesic)
      ORDER BY
        CASE s.prohlaseni_stav
          WHEN 'podepsano'    THEN 3
          WHEN 'odeslano'     THEN 2
          WHEN 'vygenerovano' THEN 1
          ELSE 0
        END DESC,
        s.updated_at DESC NULLS LAST
    ) AS rn_prohl
  FROM smluvni_stav s
),
winner_dpp AS (
  SELECT brigadnik_id, rok_computed AS rok,
         dpp_stav, dpp_dokument_id, dpp_podpis_dokument_id
  FROM ranked WHERE rn_dpp = 1
),
winner_prohl AS (
  SELECT brigadnik_id, rok_computed AS rok,
         prohlaseni_stav, prohlaseni_dokument_id, prohlaseni_podpis_dokument_id
  FROM ranked WHERE rn_prohl = 1
),
aggregates AS (
  SELECT
    brigadnik_id,
    rok_computed AS rok,
    MIN(created_at) AS created_at_min,
    MAX(updated_at) AS updated_at_max,
    MIN(dpp_vygenerovano_at)        AS dpp_vygenerovano_at,
    MIN(dpp_odeslano_at)            AS dpp_odeslano_at,
    MAX(dpp_podepsano_at)           AS dpp_podepsano_at,
    MIN(prohlaseni_vygenerovano_at) AS prohlaseni_vygenerovano_at,
    MIN(prohlaseni_odeslano_at)     AS prohlaseni_odeslano_at,
    MAX(prohlaseni_podepsano_at)    AS prohlaseni_podepsano_at
  FROM ranked
  GROUP BY brigadnik_id, rok_computed
)
SELECT
  gen_random_uuid()                                     AS id,
  a.brigadnik_id,
  a.rok,
  COALESCE(wd.dpp_stav, 'zadny')                        AS dpp_stav,
  a.dpp_vygenerovano_at,
  a.dpp_odeslano_at,
  a.dpp_podepsano_at,
  wd.dpp_dokument_id,
  wd.dpp_podpis_dokument_id,
  COALESCE(wp.prohlaseni_stav, 'zadny')                 AS prohlaseni_stav,
  a.prohlaseni_vygenerovano_at,
  a.prohlaseni_odeslano_at,
  a.prohlaseni_podepsano_at,
  wp.prohlaseni_dokument_id,
  wp.prohlaseni_podpis_dokument_id,
  a.created_at_min                                      AS created_at,
  a.updated_at_max                                      AS updated_at,
  -- D-F0013-07: platnost_do default = 31.12 roku u podepsaných DPP; jinak NULL.
  --             Server Action signDpp() tuto hodnotu nastaví přesněji v budoucnu.
  CASE
    WHEN COALESCE(wd.dpp_stav, 'zadny') = 'podepsano'
      THEN make_date(a.rok, 12, 31)
    ELSE NULL
  END                                                   AS platnost_do
FROM aggregates a
LEFT JOIN winner_dpp   wd ON wd.brigadnik_id = a.brigadnik_id AND wd.rok = a.rok
LEFT JOIN winner_prohl wp ON wp.brigadnik_id = a.brigadnik_id AND wp.rok = a.rok;

-- 4.3. Drop staré struktury smluvni_stav (indexes, unique constraint, check)
DROP INDEX IF EXISTS idx_smluvni_stav_mesic;
ALTER TABLE smluvni_stav DROP CONSTRAINT IF EXISTS smluvni_stav_unique_brigadnik_mesic;

-- 4.4. Rozšíření dpp_stav CHECK o 'ukoncena' (D-F0013-10)
ALTER TABLE smluvni_stav DROP CONSTRAINT IF EXISTS smluvni_stav_dpp_stav_check;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_dpp_stav_check
  CHECK (dpp_stav IN ('zadny', 'vygenerovano', 'odeslano', 'podepsano', 'ukoncena'));

-- 4.5. Přidání nových sloupců rok + platnost_do
ALTER TABLE smluvni_stav
  ADD COLUMN IF NOT EXISTS rok         int,
  ADD COLUMN IF NOT EXISTS platnost_do date;

-- 4.6. REPLACE data: smazat staré per-měsíc, vložit nové per-rok
--      SAFETY: DELETE + INSERT místo TRUNCATE — TRUNCATE by porušilo FK triggery
--              na historii (netýká se, ale defense-in-depth). Transakce to izoluje.
DELETE FROM smluvni_stav;

INSERT INTO smluvni_stav (
  id,
  brigadnik_id,
  rok,
  dpp_stav,
  dpp_vygenerovano_at,
  dpp_odeslano_at,
  dpp_podepsano_at,
  dpp_dokument_id,
  dpp_podpis_dokument_id,
  prohlaseni_stav,
  prohlaseni_vygenerovano_at,
  prohlaseni_odeslano_at,
  prohlaseni_podepsano_at,
  prohlaseni_dokument_id,
  prohlaseni_podpis_dokument_id,
  created_at,
  updated_at,
  platnost_do
)
SELECT
  id,
  brigadnik_id,
  rok,
  dpp_stav,
  dpp_vygenerovano_at,
  dpp_odeslano_at,
  dpp_podepsano_at,
  dpp_dokument_id,
  dpp_podpis_dokument_id,
  prohlaseni_stav,
  prohlaseni_vygenerovano_at,
  prohlaseni_odeslano_at,
  prohlaseni_podepsano_at,
  prohlaseni_dokument_id,
  prohlaseni_podpis_dokument_id,
  created_at,
  updated_at,
  platnost_do
FROM _f0013_smluvni_stav_new;

-- 4.7. Finalize smluvni_stav — drop mesic, vynutit NOT NULL + unique + index
ALTER TABLE smluvni_stav DROP COLUMN IF EXISTS mesic;

ALTER TABLE smluvni_stav ALTER COLUMN rok SET NOT NULL;

ALTER TABLE smluvni_stav DROP CONSTRAINT IF EXISTS smluvni_stav_rok_sane;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_rok_sane
  CHECK (rok BETWEEN 2020 AND 2100);

ALTER TABLE smluvni_stav DROP CONSTRAINT IF EXISTS smluvni_stav_unique_brigadnik_rok;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_unique_brigadnik_rok
  UNIQUE (brigadnik_id, rok);

CREATE INDEX IF NOT EXISTS idx_smluvni_stav_rok ON smluvni_stav (rok);

COMMENT ON COLUMN smluvni_stav.rok IS
  'F-0013: Kalendářní rok DPP/prohlášení (2026, 2025, ...). Nahrazuje per-měsíc sloupec "mesic".';
COMMENT ON COLUMN smluvni_stav.platnost_do IS
  'F-0013: Do kdy platí podepsaná DPP. Default make_date(rok,12,31). Nastavuje Server Action signDpp.';
COMMENT ON COLUMN smluvni_stav.dpp_stav IS
  'F-0013 (D-F0013-10): rozšířeno o "ukoncena" = DPP prošlá / manuálně uzavřená.';


-- ============================================================
-- 5. VIEW v_brigadnik_zakazka_status (D-F0013-02)
--    6-hodnotový agregovaný status per (brigadnik × nabidka).
--    Rok = EXTRACT(YEAR FROM nabidky.datum_od), fallback CURRENT_DATE.
--    Priorita pravidel (first match wins):
--      1. typ_brigadnika='osvc'           → 'osvc'
--      2. dpp_stav='ukoncena'             → 'ukoncena_dpp'
--      3. dpp_stav='podepsano'            → 'podepsana_dpp'
--      4. dpp_stav='odeslano'             → 'poslana_dpp'
--      5. dotaznik_vyplnen=true           → 'vyplnene_udaje'
--      6. default                         → 'nevyplnene_udaje'
-- ============================================================

CREATE OR REPLACE VIEW v_brigadnik_zakazka_status AS
WITH pairs AS (
  SELECT
    pe.brigadnik_id,
    pe.nabidka_id,
    COALESCE(
      EXTRACT(YEAR FROM n.datum_od)::int,
      EXTRACT(YEAR FROM CURRENT_DATE)::int
    ) AS rok
  FROM pipeline_entries pe
  JOIN nabidky n ON n.id = pe.nabidka_id
)
SELECT
  p.brigadnik_id,
  p.nabidka_id,
  p.rok,
  CASE
    WHEN b.typ_brigadnika = 'osvc'           THEN 'osvc'
    WHEN ss.dpp_stav = 'ukoncena'            THEN 'ukoncena_dpp'
    WHEN ss.dpp_stav = 'podepsano'           THEN 'podepsana_dpp'
    WHEN ss.dpp_stav = 'odeslano'            THEN 'poslana_dpp'
    WHEN b.dotaznik_vyplnen IS TRUE          THEN 'vyplnene_udaje'
    ELSE                                          'nevyplnene_udaje'
  END AS dokumentacni_stav
FROM pairs p
JOIN brigadnici b      ON b.id = p.brigadnik_id
LEFT JOIN smluvni_stav ss
       ON ss.brigadnik_id = p.brigadnik_id
      AND ss.rok = p.rok;

COMMENT ON VIEW v_brigadnik_zakazka_status IS
  'F-0013 (D-F0013-02): Agregovaný dokumentační status per (brigadnik × nabidka). 6 hodnot: nevyplnene_udaje | vyplnene_udaje | poslana_dpp | podepsana_dpp | ukoncena_dpp | osvc. Rok zakázky = EXTRACT(YEAR FROM nabidky.datum_od), fallback CURRENT_DATE. Priorita OSVČ > DPP stav > dotazník.';


-- ============================================================
-- 6. Regenerace závislých VIEWs na nové schema smluvni_stav (rok místo mesic)
-- ============================================================

-- 6.1. v_brigadnici_aktualni — per-rok join na smluvni_stav
CREATE OR REPLACE VIEW v_brigadnici_aktualni AS
SELECT
  b.*,
  ss.dpp_stav,
  ss.prohlaseni_stav,
  COALESCE(stats.prumerne_hodnoceni, 0) AS prumerne_hodnoceni,
  COALESCE(stats.pocet_akci, 0)         AS pocet_akci
FROM brigadnici b
LEFT JOIN smluvni_stav ss
  ON ss.brigadnik_id = b.id
  AND ss.rok = EXTRACT(YEAR FROM CURRENT_DATE)::int
LEFT JOIN (
  SELECT
    brigadnik_id,
    AVG(hodnoceni)::numeric(3,1) AS prumerne_hodnoceni,
    COUNT(DISTINCT akce_id)      AS pocet_akci
  FROM dochazka
  WHERE hodnoceni IS NOT NULL
  GROUP BY brigadnik_id
) stats ON stats.brigadnik_id = b.id
WHERE b.aktivni = true;

COMMENT ON VIEW v_brigadnici_aktualni IS
  'F-0013: aktualizováno — smluvni_stav join podle rok (místo mesic).';

-- 6.2. v_chybejici_dpp — pro akce bez podepsané DPP v roce akce
CREATE OR REPLACE VIEW v_chybejici_dpp AS
SELECT DISTINCT
  b.id,
  b.jmeno,
  b.prijmeni,
  b.telefon,
  a.datum       AS akce_datum,
  a.nazev       AS akce_nazev,
  COALESCE(ss.dpp_stav, 'zadny')        AS dpp_stav,
  COALESCE(ss.prohlaseni_stav, 'zadny') AS prohlaseni_stav
FROM prirazeni p
JOIN brigadnici b ON b.id = p.brigadnik_id
JOIN akce a       ON a.id = p.akce_id
LEFT JOIN smluvni_stav ss
  ON ss.brigadnik_id = b.id
  AND ss.rok = EXTRACT(YEAR FROM a.datum)::int
WHERE p.status = 'prirazeny'
  AND b.typ_brigadnika = 'brigadnik'        -- F-0013: OSVČ DPP nepotřebují
  AND COALESCE(ss.dpp_stav, 'zadny') NOT IN ('podepsano', 'ukoncena');

COMMENT ON VIEW v_chybejici_dpp IS
  'F-0013: aktualizováno — join podle rok akce; vylučuje OSVČ; ukoncena počítaná jako "má DPP".';


COMMIT;

-- ============================================================
-- END F-0013 Data Foundation
-- ============================================================
