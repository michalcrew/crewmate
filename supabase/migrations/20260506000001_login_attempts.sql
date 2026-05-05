-- ============================================================
-- Login attempts — rate limiting před cutoverem 11.5.
-- Datum:  2026-05-06
-- Důvod:  Brute-force ochrana přihlášení. Aktuálně se spoléháme
--         na default Supabase rate limity (per-IP, generic 429),
--         které mají špatný UX a neumí cílit per-email.
--
-- Mechanismus:
--   - Před voláním supabase.auth.signInWithPassword zkontrolujeme
--     počet selhaných pokusů pro daný email v posledních 15 min.
--   - Pokud >= 5 → blokace dalších pokusů na 15 min od posledního.
--   - Po každém pokusu (úspěšný i nikoliv) zalogujeme řádek.
--
-- Ochrana enumace emailů:
--   - Stejná error message bez ohledu na to, zda email v users
--     existuje. Tabulka login_attempts není dostupná z anon clienta.
--
-- RLS: žádné policy → žádný čtený přístup z anon/authenticated.
-- Service role klient (server actions) má plný přístup vždy.
--
-- Cleanup:
--   - Stará data > 30 dní můžeme později smazat cron jobem.
--     Pro MVP necháváme růst (málo writes).
--
-- Destruktivní operace: žádná. Pouze additivní.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  ip_address    text        NULL,
  succeeded     boolean     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Hlavní lookup: nedávné pokusy pro daný email.
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created_at
  ON public.login_attempts (lower(email), created_at DESC);

-- RLS — bez policy = nikdo přes anon/authenticated nečte.
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

COMMIT;
