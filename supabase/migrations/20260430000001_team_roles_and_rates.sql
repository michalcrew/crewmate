-- ============================================================================
-- Team roles & rates — DB schema (PR A z větší feature)
-- ============================================================================
-- Důvod:
--   Náborářka v UI dosud zadávala jen jeden `pocet_lidi` na zakázku/akci. Reálný
--   tým má ale dvě role — koordinátor a brigádník — a každá má svou hodinovou
--   sazbu. Tato migrace připravuje schema:
--
--   1) `nabidky` + `akce` rozdělují kapacitu na pocet_brigadniku + pocet_koordinatoru.
--      Sloupec `pocet_lidi` je nově `GENERATED ALWAYS AS` součet, takže aplikace
--      ho dál může číst, ale do INSERT/UPDATE už ho nezapisuje.
--   2) Sazby (sazba_brigadnik / sazba_koordinator) jsou per zakázka, NULL u
--      sazba_koordinator znamená "tato zakázka koordinátora nemá".
--      Sazby per akci nejsou — bydlí na zakázce a snapshotují se do
--      `prirazeni.sazba_hodinova` v okamžiku přiřazení (handled v PR B).
--   3) `prirazeni.role` říká, jestli je člověk přiřazen jako brigádník nebo
--      koordinátor. NULL je rezervován pro univerzálního náhradníka, který
--      ještě nemá určenou cílovou roli.
--   4) `prirazeni.pozice` (volný textový popisek) je DROP — Michal explicitně
--      potvrdil, že historická data pozice nepotřebuje archivovat.
--
-- Migrace je atomická (BEGIN/COMMIT). Backfill předchází DROP COLUMN, aby
-- nedošlo ke ztrátě dat při převodu pocet_lidi → pocet_brigadniku.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) NABIDKY: split kapacity + sazby per role
-- ============================================================================

ALTER TABLE nabidky ADD COLUMN pocet_brigadniku INT NOT NULL DEFAULT 0;
ALTER TABLE nabidky ADD COLUMN pocet_koordinatoru INT NOT NULL DEFAULT 0;

-- Backfill: dosavadní pocet_lidi se přenese do pocet_brigadniku
UPDATE nabidky SET pocet_brigadniku = COALESCE(pocet_lidi, 0);

ALTER TABLE nabidky DROP COLUMN pocet_lidi;
ALTER TABLE nabidky
  ADD COLUMN pocet_lidi INT GENERATED ALWAYS AS (pocet_brigadniku + pocet_koordinatoru) STORED;

-- Sazby per role na zakázce. NULL u sazba_koordinator = zakázka koordinátora
-- nemá povoleného. NULL u sazba_brigadnik je legacy (sazbu zatím nikdo nezadal).
ALTER TABLE nabidky ADD COLUMN sazba_brigadnik   NUMERIC(7,2);
ALTER TABLE nabidky ADD COLUMN sazba_koordinator NUMERIC(7,2);

-- ============================================================================
-- 2) AKCE: split kapacity (sazby tady nejsou — bydlí na zakázce)
-- ============================================================================

ALTER TABLE akce ADD COLUMN pocet_brigadniku INT NOT NULL DEFAULT 0;
ALTER TABLE akce ADD COLUMN pocet_koordinatoru INT NOT NULL DEFAULT 0;

UPDATE akce SET pocet_brigadniku = COALESCE(pocet_lidi, 0);

ALTER TABLE akce DROP COLUMN pocet_lidi;
ALTER TABLE akce
  ADD COLUMN pocet_lidi INT GENERATED ALWAYS AS (pocet_brigadniku + pocet_koordinatoru) STORED;

-- ============================================================================
-- 3) PRIRAZENI: role per přiřazení + DROP pozice
-- ============================================================================

ALTER TABLE prirazeni ADD COLUMN role TEXT;

ALTER TABLE prirazeni
  ADD CONSTRAINT prirazeni_role_check
  CHECK (role IS NULL OR role IN ('brigadnik', 'koordinator'));

-- Backfill: dosavadní prirazeni jsou všechna brigádníci (kromě náhradníků,
-- kteří jsou univerzální a role zůstává NULL).
UPDATE prirazeni
SET role = 'brigadnik'
WHERE status IN ('prirazeny', 'vypadl');

-- Náhradníci (status='nahradnik') mohou mít role NULL. Ostatní statusy
-- (prirazeny / vypadl) musí mít role vyplněnou.
ALTER TABLE prirazeni
  ADD CONSTRAINT prirazeni_role_required
  CHECK (status = 'nahradnik' OR role IS NOT NULL);

-- DROP pozice — historická data se nezachovávají (Michal explicitně potvrdil).
-- Předtím musí padnout views, které na sloupec referencují (v_vyplata_mesic
-- z F-0022, v_mesicni_dochazka z initial schema). Recreate hned po DROP s
-- p.role na místě p.pozice — zachování stejných sloupcových jmen by bylo
-- zavádějící (semantika je jiná), takže přejmenujeme na `role`.
DROP VIEW IF EXISTS v_vyplata_mesic;
DROP VIEW IF EXISTS v_mesicni_dochazka;

ALTER TABLE prirazeni DROP COLUMN pozice;

-- Recreate v_vyplata_mesic (poslední verze: F-0022 hotfix v3, midnight-safe).
CREATE VIEW v_vyplata_mesic AS
SELECT
  to_char(a.datum, 'YYYY-MM')              AS mesic_rok,
  p.id                                     AS prirazeni_id,
  p.akce_id,
  p.brigadnik_id,
  p.role,
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
  (
    CASE
      WHEN d.prichod IS NULL OR d.odchod IS NULL THEN
        COALESCE(d.hodin_celkem, 0)
      ELSE ((
        EXTRACT(EPOCH FROM d.odchod) - EXTRACT(EPOCH FROM d.prichod)
        + CASE WHEN d.odchod < d.prichod THEN 86400 ELSE 0 END
      ) / 3600.0)::numeric(4,1)
    END
  )::numeric(4,1)                          AS hodin_celkem,
  d.extra_odmena_kc,
  (
    CASE
      WHEN d.prichod IS NULL OR d.odchod IS NULL THEN
        COALESCE(d.hodin_celkem, 0)
      ELSE (
        EXTRACT(EPOCH FROM d.odchod) - EXTRACT(EPOCH FROM d.prichod)
        + CASE WHEN d.odchod < d.prichod THEN 86400 ELSE 0 END
      ) / 3600.0
    END
    * COALESCE(p.sazba_hodinova, 0)
    + COALESCE(d.extra_odmena_kc, 0)
  )::numeric(12,2)                         AS celkem_za_akci
FROM prirazeni p
JOIN akce       a ON a.id = p.akce_id
JOIN brigadnici b ON b.id = p.brigadnik_id
LEFT JOIN dochazka d ON d.prirazeni_id = p.id;

COMMENT ON VIEW v_vyplata_mesic IS
  'F-0022 hotfix v3 + team-roles migrace: p.pozice nahrazena p.role.';

-- Recreate v_mesicni_dochazka (initial schema view).
CREATE VIEW v_mesicni_dochazka AS
SELECT
  a.nazev AS akce_nazev,
  a.datum AS akce_datum,
  b.id AS brigadnik_id,
  b.jmeno,
  b.prijmeni,
  b.rodne_cislo,  -- šifrováno, dešifrovat v app layer
  p.role,
  d.prichod,
  d.odchod,
  d.hodin_celkem,
  d.hodnoceni
FROM dochazka d
JOIN prirazeni p ON p.id = d.prirazeni_id
JOIN akce a ON a.id = d.akce_id
JOIN brigadnici b ON b.id = d.brigadnik_id
ORDER BY a.datum, a.nazev, b.prijmeni;

-- Zachovat security_invoker = true (defense-in-depth z migrace
-- 20260429000010_sec_invoker_remaining_views; recreate by jinak shodil
-- nastavení zpět na default SECURITY DEFINER).
ALTER VIEW v_vyplata_mesic    SET (security_invoker = true);
ALTER VIEW v_mesicni_dochazka SET (security_invoker = true);

COMMIT;
