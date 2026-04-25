-- ============================================================
-- F-0022 hotfix v3 — view: zachovat numeric(4,1) typ pro hodin_celkem
-- ============================================================
-- V2 selhalo s:
--   42P16: cannot change data type of view column "hodin_celkem"
--   from numeric(4,1) to numeric
-- Původní `dochazka.hodin_celkem` je `numeric(4,1)`, view přebírá typ.
-- PG OR REPLACE VIEW neumí změnit typ existujícího sloupce.
--
-- V3 cast-uje výsledek "safe" výpočtu zpět na `numeric(4,1)`.
-- Max hodin per akce by se mělo vejít (24h max), takže 4 cifry × 1 desetina stačí.
-- ============================================================

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
  'F-0022 hotfix v3 (29.4.): hodin_celkem midnight-safe, typ numeric(4,1) zachován pro PG OR REPLACE compat.';

-- Ověření:
-- SELECT prijmeni, jmeno, akce_nazev, prichod, odchod, hodin_celkem
-- FROM v_vyplata_mesic
-- WHERE prijmeni ILIKE 'Černý%' OR prijmeni ILIKE 'Cerny%';
--
-- SELECT COUNT(*) FROM v_vyplata_mesic WHERE hodin_celkem < 0;
-- -- mělo by být 0.
