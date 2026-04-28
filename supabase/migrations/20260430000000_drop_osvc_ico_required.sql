-- ============================================================
-- Drop constraint brigadnici_osvc_ico_required
-- Datum: 2026-04-28
-- Důvod: Náborářka potřebuje umět přepnout typ_brigadnika='osvc'
--        i u brigádníka, který ještě nemá IČO. IČO se případně
--        doplní později. Aplikační guard byl odstraněn ve stejném PR.
--
-- Původ constraintu: 20260422000000_f0013_data_foundation.sql
--   CHECK (typ_brigadnika <> 'osvc' OR osvc_ico IS NOT NULL)
-- ============================================================

BEGIN;

ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_osvc_ico_required;

COMMIT;
