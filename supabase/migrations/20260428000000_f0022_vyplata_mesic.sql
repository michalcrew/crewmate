-- ============================================================
-- F-0022 — Měsíční výplatní přehled (výplata)
-- ============================================================
-- Přidává:
--   1. prirazeni.sazba_hodinova  — sazba Kč/hod per přiřazení (editovatelná)
--   2. dochazka.extra_odmena_kc  — dýško / bonus per brigádník × akce
--   3. vyplata_uzamceni          — měsíční lock ("tabulka je uzavřená")
--   4. v_vyplata_mesic           — agregační VIEW pro přehled + XLSX export
--
-- Vše je NON-BREAKING ADD (žádné ALTER existujících sloupců, žádný DROP).
-- Schema-freeze výjimka schválena Michalem 2026-04-28.
-- ============================================================

-- ------------------------------------------------------------
-- 1. prirazeni.sazba_hodinova
-- ------------------------------------------------------------
ALTER TABLE prirazeni
  ADD COLUMN IF NOT EXISTS sazba_hodinova numeric(10,2) NULL;

ALTER TABLE prirazeni
  DROP CONSTRAINT IF EXISTS prirazeni_sazba_hodinova_nonneg;
ALTER TABLE prirazeni
  ADD CONSTRAINT prirazeni_sazba_hodinova_nonneg
  CHECK (sazba_hodinova IS NULL OR sazba_hodinova >= 0);

COMMENT ON COLUMN prirazeni.sazba_hodinova IS
  'F-0022: Hrubá hodinová sazba Kč/hod pro toto přiřazení (editovatelné v měsíčním výplatním přehledu). NULL = nenastaveno → celkem_za_akci počítá s 0.';

-- ------------------------------------------------------------
-- 2. dochazka.extra_odmena_kc
-- ------------------------------------------------------------
ALTER TABLE dochazka
  ADD COLUMN IF NOT EXISTS extra_odmena_kc numeric(10,2) NULL;

ALTER TABLE dochazka
  DROP CONSTRAINT IF EXISTS dochazka_extra_odmena_kc_nonneg;
ALTER TABLE dochazka
  ADD CONSTRAINT dochazka_extra_odmena_kc_nonneg
  CHECK (extra_odmena_kc IS NULL OR extra_odmena_kc >= 0);

COMMENT ON COLUMN dochazka.extra_odmena_kc IS
  'F-0022: Dýško / bonus Kč per brigádník × akce. Přičítá se k hodin_celkem * sazba_hodinova.';

-- ------------------------------------------------------------
-- 3. vyplata_uzamceni — lock celého měsíce
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vyplata_uzamceni (
  mesic_rok            text PRIMARY KEY,
  uzamceno_at          timestamptz NOT NULL DEFAULT now(),
  uzamceno_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  poznamka             text NULL,

  CONSTRAINT vyplata_uzamceni_mesic_format
    CHECK (mesic_rok ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE vyplata_uzamceni IS
  'F-0022: Uzamčení měsíčního výplatního přehledu. Řádek existuje = měsíc je uzavřený. Mazání řádku = odemknutí (admin-only).';
COMMENT ON COLUMN vyplata_uzamceni.mesic_rok IS
  'Formát "YYYY-MM", např. "2026-04". Primární klíč — 1 řádek per měsíc.';

CREATE INDEX IF NOT EXISTS idx_vyplata_uzamceni_uzamceno_at
  ON vyplata_uzamceni (uzamceno_at DESC);

-- RLS: stejný pattern jako ostatní tabulky (prirazeni, dochazka, ...).
-- Authenticated full access — role-check (admin/náborář) řeší aplikační
-- vrstva v server actions. Service role (admin client) bypassuje RLS.
ALTER TABLE vyplata_uzamceni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_vyplata_uzamceni" ON vyplata_uzamceni;
CREATE POLICY "authenticated_all_vyplata_uzamceni"
  ON vyplata_uzamceni FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 4. v_vyplata_mesic — agregační view per prirazeni × měsíc
-- ------------------------------------------------------------
-- Přiřazení měsíce:
--   Podle akce.datum (start akce). Akce co začne 31.5. ve 20:00 a končí
--   1.6. ve 2:00 se počítá do května (Michalovo pravidlo 24.4.: akce
--   přelévající <6h do dalšího měsíce při délce <18h → měsíc startu).
--   Protože `akce.datum` je start date, stačí brát to_char(datum, 'YYYY-MM').
--
-- Celkem za akci:
--   hodin_celkem * sazba_hodinova + extra_odmena_kc
--   (NULL se počítá jako 0 aby sum fungoval i pro rozpracované záznamy)
--
-- Scope:
--   Všechna přiřazení kromě explicitně vypadlých/nahradníků bez zápisu.
--   Admin UI pak dodatečně filtruje podle akce.stav (proběhlé vs. plánované).

CREATE OR REPLACE VIEW v_vyplata_mesic AS
SELECT
  to_char(a.datum, 'YYYY-MM')              AS mesic_rok,
  p.id                                     AS prirazeni_id,
  p.akce_id,
  p.brigadnik_id,
  p.pozice,
  p.status                                 AS prirazeni_status,
  p.sazba_hodinova,
  a.nazev                                  AS akce_nazev,
  a.datum                                  AS akce_datum,
  a.stav                                   AS akce_stav,
  b.jmeno,
  b.prijmeni,
  b.typ_brigadnika,
  d.id                                     AS dochazka_id,
  d.prichod,
  d.odchod,
  d.hodin_celkem,
  d.extra_odmena_kc,
  (
    COALESCE(d.hodin_celkem, 0) * COALESCE(p.sazba_hodinova, 0)
    + COALESCE(d.extra_odmena_kc, 0)
  )::numeric(12,2)                         AS celkem_za_akci
FROM prirazeni p
JOIN akce       a ON a.id = p.akce_id
JOIN brigadnici b ON b.id = p.brigadnik_id
LEFT JOIN dochazka d ON d.prirazeni_id = p.id;

COMMENT ON VIEW v_vyplata_mesic IS
  'F-0022: Agregační view pro měsíční výplatní přehled. 1 řádek per prirazeni. celkem_za_akci = hodin * sazba + extra, NULL počítáno jako 0.';

-- ------------------------------------------------------------
-- Ověření (kontrolní queries pro Michala po spuštění):
-- ------------------------------------------------------------
-- 1) Sloupce přidané:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name IN ('prirazeni','dochazka')
--      AND column_name IN ('sazba_hodinova','extra_odmena_kc');
--    Mělo by vrátit 2 řádky.
--
-- 2) Tabulka existuje:
--    SELECT to_regclass('public.vyplata_uzamceni'); -- ne-NULL.
--
-- 3) View funguje:
--    SELECT COUNT(*) FROM v_vyplata_mesic;
--    -- měl by odpovídat COUNT(*) z prirazeni.
--
-- 4) Sample:
--    SELECT mesic_rok, jmeno, prijmeni, typ_brigadnika, akce_nazev,
--           hodin_celkem, sazba_hodinova, extra_odmena_kc, celkem_za_akci
--    FROM v_vyplata_mesic
--    WHERE mesic_rok = '2026-04'
--    ORDER BY typ_brigadnika, prijmeni, jmeno;
