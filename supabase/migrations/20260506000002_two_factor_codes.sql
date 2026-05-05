-- ============================================================
-- Two-factor authentication codes — emailové 2FA před cutoverem 11.5.
-- Datum:  2026-05-06
-- Důvod:  Po úspěšném zadání emailu+hesla pošleme uživateli 6místný
--         kód do mailu, který musí zadat. Důvěryhodné zařízení
--         (cookie) může 2FA krok přeskočit po dobu 90 dní.
--
-- Mechanismus:
--   - Po úspěšném password loginu vygenerujeme náhodný 6místný kód.
--   - Kód NEUKLÁDÁME plain text — jen jeho SHA256 hash.
--   - Kód má platnost 10 minut. Po vypršení nelze ověřit.
--   - Po úspěšném ověření (nebo požadovaném resend) se kód označí used.
--   - Stará data se postupně mažou (cron, později), pro MVP necháváme.
--
-- RLS: žádné policy → čte jen service role (server actions).
--
-- Destruktivní operace: žádná. Pouze additivní.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.two_factor_codes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash     text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_codes_user_created
  ON public.two_factor_codes (user_id, created_at DESC);

ALTER TABLE public.two_factor_codes ENABLE ROW LEVEL SECURITY;

COMMIT;
