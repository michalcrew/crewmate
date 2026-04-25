-- ============================================================
-- F-0022 hotfix — view: správný výpočet hodin přes půlnoc
-- ============================================================
-- Problém: dochazka.hodin_celkem (DB-side computed column) vrací
-- záporné číslo když odchod < příchod (přes půlnoc). Příklad:
--   příchod 18:00, odchod 02:00 → hodin_celkem = -16  (mělo by být 8)
-- Existující stránka /app/prehled-mesic má JS fallback `safeHours`,
-- ale view v_vyplata_mesic ho neměl → celkem_za_akci se počítal špatně.
--
-- Tento hotfix:
--   1) Přidá do view sloupec `hodin_safe` — správně počítá přes půlnoc.
--   2) celkem_za_akci nyní používá hodin_safe místo hodin_celkem.
--   3) hodin_celkem zůstává v view (původní hodnota z DB) — pro audit /
--      debug, kdyby někdo chtěl srovnat. UI ale konzumuje hodin_safe.
--
-- Algoritmus (PG-friendly):
--   sekundy_odchod = EXTRACT(EPOCH FROM d.odchod)
--   sekundy_prichod = EXTRACT(EPOCH FROM d.prichod)
--   pokud (odchod < prichod) → +86400  (půlnoc překlenutá)
--   hodiny = (rozdíl) / 3600
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
  d.hodin_celkem                           AS hodin_celkem_raw,  -- původní (potenciálně buggy) hodnota z DB
  CASE
    WHEN d.prichod IS NULL OR d.odchod IS NULL THEN
      COALESCE(d.hodin_celkem, 0)
    ELSE (
      EXTRACT(EPOCH FROM d.odchod) - EXTRACT(EPOCH FROM d.prichod)
      + CASE WHEN d.odchod < d.prichod THEN 86400 ELSE 0 END
    ) / 3600.0
  END                                      AS hodin_celkem,       -- "safe" — UI ho čte pod tímto jménem
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
  'F-0022 hotfix 29.4.: hodin_celkem je nyní midnight-safe (počítá +24h pokud odchod < prichod). hodin_celkem_raw drží původní DB hodnotu pro audit.';

-- ------------------------------------------------------------
-- Ověření po spuštění:
-- ------------------------------------------------------------
-- 1) David Černý 18:00→02:00 by měl mít hodin_celkem = 8 a celkem_za_akci > 0
--    (pokud má sazbu nastavenou):
--    SELECT prijmeni, jmeno, akce_nazev, prichod, odchod,
--           hodin_celkem_raw, hodin_celkem, celkem_za_akci
--    FROM v_vyplata_mesic
--    WHERE prijmeni ILIKE 'Černý%' OR prijmeni ILIKE 'Cerny%';
--
-- 2) Žádné záporné hodiny:
--    SELECT COUNT(*) FROM v_vyplata_mesic WHERE hodin_celkem < 0;
--    -- mělo by být 0.
