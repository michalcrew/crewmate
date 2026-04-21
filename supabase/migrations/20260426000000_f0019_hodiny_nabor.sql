-- ============================================================
-- F-0019 — Hodiny-nábor per-zakázka + v minutách
-- Datum:  2026-04-26
-- Autor:  Data Agent (multi-agent orchestration, E-0002 F-0019)
-- Vstupy: artifacts/E-0002/F-0019-hodiny-nabor/01-product.md
--         artifacts/E-0002/F-0019-hodiny-nabor/02-decisions.md
--         artifacts/E-0002/F-0019-hodiny-nabor/03-architect.md
--
-- Scope:
--   1) Odstranit UNIQUE (user_id, datum) — povolit multi-entry per den.
--   2) Migrovat `hodin numeric(4,1)` → `trvani_minut int` (clamp 1..1440).
--   3) Přidat `nabidka_id uuid NULL` (FK → nabidky, ON DELETE SET NULL)
--      a `typ_zaznamu text` (nabidka|ostatni, default 'ostatni').
--   4) Přidat indexy pro typické dotazy (user+datum, nabidka partial).
--   5) Přidat `users.sazba_kc_hod numeric(6,2) NULL`.
--   6) Vytvořit VIEW `v_hodiny_per_zakazka` (security_invoker=true)
--      pro admin přehled nákladů per (zakázka, měsíc).
--
-- Ordering (hard requirement per Architect §6):
--   DROP VIEW → DROP UNIQUE → ADD trvani_minut → backfill → NOT NULL+CHECK
--   → DROP hodin → ADD nabidka_id/typ_zaznamu → INDEXy → users.sazba_kc_hod
--   → CREATE VIEW → COMMENT.
--
-- RLS: `naborar_hodiny` už má `authenticated_all` policy — beze změny (MVP).
--      `users.sazba_kc_hod` visibility je řešena na app layer (explicit
--      column whitelist v server actions; viz decision D-F0019-09).
-- ============================================================

BEGIN;

-- ============================================================
-- 1) DROP VIEW (idempotence pro dev/staging re-run)
-- ============================================================
-- V production VIEW neexistuje, ale guard je nutný, aby DROP COLUMN `hodin`
-- neselhal kvůli závislosti starší verze VIEW na `hodin`.
DROP VIEW IF EXISTS v_hodiny_per_zakazka;

-- ============================================================
-- 2) DROP UNIQUE (user_id, datum)
-- ============================================================
-- US-1A-1 + D-F0019-07/08: povolujeme více záznamů per den per user.
-- Soft-warn 20 entries se řeší form-level, DB hard-cap je per-entry 1440 min.
ALTER TABLE naborar_hodiny
  DROP CONSTRAINT IF EXISTS naborar_hodiny_user_id_datum_key;

-- Pojistka pro varianty jmen (starší migrace mohla použít custom name)
ALTER TABLE naborar_hodiny
  DROP CONSTRAINT IF EXISTS naborar_hodiny_unique_user_datum;

-- ============================================================
-- 3) ADD trvani_minut (nullable first, backfill, NOT NULL + CHECK)
-- ============================================================
ALTER TABLE naborar_hodiny
  ADD COLUMN IF NOT EXISTS trvani_minut integer;

-- Backfill s clampem do [1, 1440] — legacy řádky mohly mít `hodin > 24`
-- nebo `hodin = 0` (degenerated); clamp zajistí pass pro následný CHECK.
UPDATE naborar_hodiny
  SET trvani_minut = GREATEST(1, LEAST(1440, ROUND(hodin * 60)::int))
  WHERE trvani_minut IS NULL;

ALTER TABLE naborar_hodiny
  ALTER COLUMN trvani_minut SET NOT NULL;

-- Stable constraint name (per-entry DB safeguard; sum ≤ 1440 je form-level).
ALTER TABLE naborar_hodiny
  DROP CONSTRAINT IF EXISTS naborar_hodiny_trvani_minut_range;

ALTER TABLE naborar_hodiny
  ADD CONSTRAINT naborar_hodiny_trvani_minut_range
  CHECK (trvani_minut > 0 AND trvani_minut <= 1440);

-- ============================================================
-- 4) DROP legacy `hodin` column
-- ============================================================
-- Teprve teď, kdy je `trvani_minut` populated a VIEW neexistuje,
-- můžeme bezpečně DROP. Destructive — rollback = restore z backupu.
ALTER TABLE naborar_hodiny
  DROP COLUMN IF EXISTS hodin;

-- ============================================================
-- 5) ADD nabidka_id + typ_zaznamu
-- ============================================================
-- D-F0019-03: ON DELETE SET NULL + typ_zaznamu='nabidka' zachován
-- (historical truth — „tento čas byl na zakázce X, která už neexistuje").
ALTER TABLE naborar_hodiny
  ADD COLUMN IF NOT EXISTS nabidka_id uuid NULL
    REFERENCES nabidky(id) ON DELETE SET NULL;

ALTER TABLE naborar_hodiny
  ADD COLUMN IF NOT EXISTS typ_zaznamu text NOT NULL DEFAULT 'ostatni';

-- Stable CHECK constraint name.
ALTER TABLE naborar_hodiny
  DROP CONSTRAINT IF EXISTS naborar_hodiny_typ_zaznamu_valid;

ALTER TABLE naborar_hodiny
  ADD CONSTRAINT naborar_hodiny_typ_zaznamu_valid
  CHECK (typ_zaznamu IN ('nabidka', 'ostatni'));

-- ============================================================
-- 6) Indexy
-- ============================================================
-- Hlavní dotaz: list per user za měsíc → (user_id, datum DESC).
CREATE INDEX IF NOT EXISTS idx_naborar_hodiny_user_datum
  ON naborar_hodiny (user_id, datum DESC);

-- Admin přehled per-zakázka joinne přes nabidka_id. Partial index
-- (jen NOT NULL) minimalizuje velikost — většina raw read-path filtruje
-- `typ='ostatni'` kde nabidka_id IS NULL.
CREATE INDEX IF NOT EXISTS idx_naborar_hodiny_nabidka
  ON naborar_hodiny (nabidka_id)
  WHERE nabidka_id IS NOT NULL;

-- ============================================================
-- 7) users.sazba_kc_hod
-- ============================================================
-- D-F0019-04: jedna aktuální sazba = jedna pravda (retroaktivní).
-- Historical timeline = post-MVP, až se sazba začne měnit.
-- CHECK povoluje NULL (náborářka bez nastavené sazby → náklad = 0 ve VIEW,
-- UI zobrazuje `—` místo `0 Kč` per tooltip „Sazba nezadána").
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sazba_kc_hod numeric(6,2) NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_sazba_kc_hod_range;

ALTER TABLE users
  ADD CONSTRAINT users_sazba_kc_hod_range
  CHECK (sazba_kc_hod IS NULL OR (sazba_kc_hod >= 0 AND sazba_kc_hod <= 9999.99));

COMMENT ON COLUMN users.sazba_kc_hod IS
  'Hodinová sazba náborářky (Kč/h). SELECT povolen všem authenticated '
  '(VIEW join), UPDATE jen přes server action s role=admin guardem + audit. '
  'NULL = nenastaveno (náklad 0 ve VIEW, UI render „—").';

-- ============================================================
-- 8) VIEW v_hodiny_per_zakazka
-- ============================================================
-- Admin přehled: náklady per (zakázka, měsíc).
-- security_invoker=true (F-0013 pattern) — VIEW běží pod právy volajícího,
-- RLS na naborar_hodiny vyfiltruje řádky podle role (nábor = self-only,
-- admin = all). Nábor tak uvidí jen náklad na vlastní práci (což je OK,
-- svoji sazbu vidět smí — viz D-F0019-09).
--
-- WHERE typ_zaznamu='nabidka' AND nabidka_id IS NOT NULL:
--   - typ='ostatni' se v přehledu per-zakázka neobjeví (by design).
--   - nabidka_id IS NOT NULL guard je redundantní (CHECK by měl zajistit),
--     ale explicit pro bezpečnost pokud někdo CHECK invariantu změní.
--
-- Signature: nabidka_id, zakazka_nazev, mesic, celkem_minut, celkem_hodin,
--            pocet_naborarek, naklad_kc.
CREATE VIEW v_hodiny_per_zakazka
WITH (security_invoker = true) AS
SELECT
  n.id                                                     AS nabidka_id,
  n.nazev                                                  AS zakazka_nazev,
  DATE_TRUNC('month', h.datum)::date                       AS mesic,
  SUM(h.trvani_minut)::int                                 AS celkem_minut,
  ROUND(SUM(h.trvani_minut) / 60.0, 2)::numeric(10,2)      AS celkem_hodin,
  COUNT(DISTINCT h.user_id)::int                           AS pocet_naborarek,
  ROUND(
    SUM((h.trvani_minut / 60.0) * COALESCE(u.sazba_kc_hod, 0)),
    2
  )::numeric(10,2)                                         AS naklad_kc
FROM naborar_hodiny h
JOIN nabidky n ON n.id = h.nabidka_id
JOIN users   u ON u.id = h.user_id
WHERE h.typ_zaznamu = 'nabidka'
  AND h.nabidka_id IS NOT NULL
GROUP BY n.id, n.nazev, DATE_TRUNC('month', h.datum);

COMMENT ON VIEW v_hodiny_per_zakazka IS
  'Agregát nákladů per (zakázka, měsíc). security_invoker=true → RLS '
  'volajícího. Používá admin `/app/hodiny/prehled`. Zdroj pravdy pro '
  'naklad_kc; per-row breakdown počítá server action helperem '
  'computeNakladKc(minut, sazba).';

COMMIT;

-- ============================================================
-- ROLLBACK PLAN (documentation only — NOT runnable as-is)
-- ============================================================
-- Migrace je DESTRUCTIVE: DROP COLUMN `hodin` nelze reverznout bez
-- obnovy dat z backupu. Rollback postup:
--
-- 1) Restore DB z backupu pořízeného před migrací (Supabase PITR nebo
--    pg_dump snapshot). Alternativně: recover z logical replica.
--
-- 2) Manuální partial rollback (pokud nelze full restore — ztráta dat
--    zapsaných po migraci v typ_zaznamu='nabidka'):
--
--    BEGIN;
--    DROP VIEW IF EXISTS v_hodiny_per_zakazka;
--    ALTER TABLE naborar_hodiny DROP CONSTRAINT IF EXISTS
--      naborar_hodiny_typ_zaznamu_valid;
--    ALTER TABLE naborar_hodiny DROP COLUMN IF EXISTS typ_zaznamu;
--    ALTER TABLE naborar_hodiny DROP COLUMN IF EXISTS nabidka_id;
--    ALTER TABLE naborar_hodiny ADD COLUMN hodin numeric(4,1);
--    UPDATE naborar_hodiny SET hodin = ROUND(trvani_minut / 60.0, 1);
--    ALTER TABLE naborar_hodiny ALTER COLUMN hodin SET NOT NULL;
--    ALTER TABLE naborar_hodiny DROP CONSTRAINT IF EXISTS
--      naborar_hodiny_trvani_minut_range;
--    ALTER TABLE naborar_hodiny DROP COLUMN IF EXISTS trvani_minut;
--    ALTER TABLE naborar_hodiny ADD CONSTRAINT naborar_hodiny_user_id_datum_key
--      UNIQUE (user_id, datum);  -- POZOR: fail pokud existují duplikáty!
--    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sazba_kc_hod_range;
--    ALTER TABLE users DROP COLUMN IF EXISTS sazba_kc_hod;
--    DROP INDEX IF EXISTS idx_naborar_hodiny_user_datum;
--    DROP INDEX IF EXISTS idx_naborar_hodiny_nabidka;
--    COMMIT;
--
-- 3) Revert aplikační kód (server actions, FE komponenty) na verzi
--    před F-0019.
--
-- Varovaní:
--   - Precise unit conversion hodin→minut→hodin ztrácí <1 min (ROUND).
--   - Re-add UNIQUE FAIL pokud user mezitím vložil 2+ záznamy per den.
--     Nutno nejprve manuálně deduplikovat (SUM hodin → jeden řádek).
--   - Sazby v users.sazba_kc_hod budou ztraceny bez backupu.
-- ============================================================
