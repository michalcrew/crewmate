-- ============================================================
-- Security: SECURITY INVOKER pro zbylé views
-- ============================================================
-- Supabase Advisor 28.4. flagnul 2 views jako CRITICAL:
--   public.v_mesicni_dochazka  (initial schema 2026-04-15)
--   public.v_vyplata_mesic     (F-0022)
-- Obě měly default SECURITY DEFINER — runs with creator's privileges,
-- bypassuje RLS volajícího. Defense-in-depth fix: SECURITY INVOKER.
--
-- Stejný pattern jako 20260422000001_f0013_security_invoker_views.sql
-- (tam šlo o v_brigadnik_zakazka_status, v_brigadnici_aktualni,
--  v_chybejici_dpp).
-- ============================================================

BEGIN;

ALTER VIEW v_mesicni_dochazka SET (security_invoker = true);
ALTER VIEW v_vyplata_mesic    SET (security_invoker = true);

COMMIT;

-- ------------------------------------------------------------
-- Ověření po spuštění (volitelné):
-- SELECT relname, reloptions
-- FROM pg_class
-- WHERE relkind = 'v'
--   AND relnamespace = 'public'::regnamespace
--   AND relname IN ('v_mesicni_dochazka','v_vyplata_mesic');
-- Mělo by ukázat 'security_invoker=true' v reloptions.
