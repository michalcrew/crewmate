-- ============================================================
-- F-0022 hotfix v2 — view: správný výpočet hodin přes půlnoc
-- ============================================================
-- Předchozí hotfix (20260429000000) selhal v Supabase s chybou
--   42P16: cannot change name of view column "hodin_celkem" to "hodin_celkem_raw"
-- protože PG `CREATE OR REPLACE VIEW` neumí přejmenovat existující sloupec.
--
-- Tato verze nepřejmenovává nic — nahrazuje pouze výpočet v `hodin_celkem`
-- za "safe" formuli (přes-půlnoc-aware) a `hodin_celkem_raw` se nepřidává.
-- Sloupce view zůstávají identické s PR 1.
--
-- Algoritmus:
--   pokud (odchod < prichod) → +86400 sekund (24h, akce přes půlnoc)
--   hodiny = rozdíl_sekund / 3600
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
  CASE
    WHEN d.prichod IS NULL OR d.odchod IS NULL THEN
      COALESCE(d.hodin_celkem, 0)
    ELSE (
      EXTRACT(EPOCH FROM d.odchod) - EXTRACT(EPOCH FROM d.prichod)
      + CASE WHEN d.odchod < d.prichod THEN 86400 ELSE 0 END
    ) / 3600.0
  END                                      AS hodin_celkem,
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
  'F-0022 hotfix v2 (29.4.): hodin_celkem je nyní midnight-safe (počítá +24h pokud odchod < prichod). Sloupce view jsou identické s původní PR 1 verzí.';

-- ------------------------------------------------------------
-- Ověření po spuštění:
-- ------------------------------------------------------------
-- 1) David Černý 18:00→02:00 by měl mít hodin_celkem = 8.0
--    SELECT prijmeni, jmeno, akce_nazev, prichod, odchod, hodin_celkem
--    FROM v_vyplata_mesic
--    WHERE prijmeni ILIKE 'Černý%' OR prijmeni ILIKE 'Cerny%';
--
-- 2) Žádné záporné hodiny v žádném záznamu:
--    SELECT COUNT(*) FROM v_vyplata_mesic WHERE hodin_celkem < 0;
--    -- mělo by být 0.
