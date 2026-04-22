-- ============================================================
-- F-0021c — email_threads.campaign_id (bulk email příprava)
-- Datum:  2026-04-27
-- Epic:   E-0002 schema freeze
-- Důvod:  LG-2 z auditu — bulk compose/campaign feature je post-MVP,
--         ale sloupec campaign_id chceme v schématu před freezem, aby
--         se po cutoveru nemuselo migrovat. Hodnota je nullable, žádný
--         FK zatím (tabulka email_campaigns ještě neexistuje).
--
-- Scope:
--   1) email_threads.campaign_id (uuid, nullable, bez FK)
--   2) Partial index pro GROUP BY campaign_id (rychlé per-campaign
--      metriky, jen pro non-NULL values).
--
-- Post-MVP plán (až se implementuje bulk email):
--   - CREATE TABLE email_campaigns (id, nazev, created_by_user_id, ...)
--   - ALTER TABLE email_threads ADD CONSTRAINT fk_campaign
--     FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id)
--     ON DELETE SET NULL.
--   - Ale toto je UŽ JEN PO cutoveru; DB freeze dodržen, protože:
--     (a) ADD CONSTRAINT bez validate je non-breaking,
--     (b) existující code nečte campaign_id = NULL nic nerozbije.
--
-- Destruktivní operace: žádná. Pouze additivní.
-- ============================================================

BEGIN;

ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS campaign_id uuid NULL;

-- Partial index pro filter "where campaign_id = X" (bulk metrics).
-- NULL values nejsou v indexu → šetří prostor.
CREATE INDEX IF NOT EXISTS idx_email_threads_campaign
  ON email_threads (campaign_id)
  WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN email_threads.campaign_id IS
  'F-0021c LG-2 příprava: Bulk email campaign grouping. NULL = individuální email. Tabulka email_campaigns přijde post-MVP.';

COMMIT;

-- ============================================================
-- Rollback plan (ruční):
--   BEGIN;
--   DROP INDEX IF EXISTS idx_email_threads_campaign;
--   ALTER TABLE email_threads DROP COLUMN IF EXISTS campaign_id;
--   COMMIT;
-- ============================================================
