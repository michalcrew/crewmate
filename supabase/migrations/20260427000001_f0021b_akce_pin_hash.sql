-- ============================================================
-- F-0021b — Akce PIN hash column (bcrypt preparation)
-- Datum:  2026-04-27
-- Epic:   E-0002 schema freeze
-- Důvod:  MD-13 / SEC-016 z auditu. Akce.pin_kod je aktuálně plaintext.
--         Schema-freeze policy: přidáme sloupec pin_hash TEĎ, aby budoucí
--         bcrypt rewrite nevyžadoval další migraci po cutoveru.
--
-- Scope této migrace (SCHEMA ONLY):
--   1) akce.pin_hash (text, nullable) — bcrypt hash; později povinný
--
-- Co tato migrace NEDĚLÁ (záměrně):
--   - NEHASHUJE existující plaintext pin_kod (backfill je v kódu, PR post-freeze).
--   - NEODSTRAŇUJE sloupec pin_kod. Ten zůstává pro kompatibilitu, dokud
--     aplikační kód nebude přepsán na bcrypt (6 call sites v
--     lib/actions/{dochazka,akce,nabidky}.ts).
--   - NEPŘIDÁVÁ rate limiting — to je aplikační (Edge function / middleware).
--
-- Transition plan (post-migrace, v kódu):
--   1. App PR: `generatePin()` zapisuje do obou sloupců (plaintext + bcrypt).
--   2. App PR: verifikace čte `pin_hash` pokud je NOT NULL, jinak fallback
--      na `pin_kod`.
--   3. Backfill script: `UPDATE akce SET pin_hash = bcrypt(pin_kod)`.
--   4. App PR: odstranit `pin_kod` čtení, jen `pin_hash`.
--   5. Až všichni klienti na novém kódu → nová migrace DROP pin_kod
--      (post-freeze by to mohla být poslední migrace nebo ji odložit
--      jako "technical debt" po MVP).
--
-- Destruktivní operace: žádná. Pouze additivní.
-- ============================================================

BEGIN;

ALTER TABLE akce
  ADD COLUMN IF NOT EXISTS pin_hash             text        NULL,
  ADD COLUMN IF NOT EXISTS pin_pokus_count      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_lock_until       timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pin_posledni_pokus_at timestamptz NULL;

COMMENT ON COLUMN akce.pin_hash IS
  'F-0021b MD-13: bcrypt hash 6-místného PIN. Aplikační vrstva bude používat pin_hash pokud NOT NULL, jinak fallback na plaintext pin_kod. Po backfillu se pin_kod deprekuje.';
COMMENT ON COLUMN akce.pin_pokus_count IS
  'F-0021b: Rate limit — počet pokusů o PIN. Reset na 0 při úspěšném loginu nebo po expiraci pin_lock_until.';
COMMENT ON COLUMN akce.pin_lock_until IS
  'F-0021b: Rate limit — do kdy je PIN zablokovaný (po N neúspěšných pokusech). Aplikační logic: pokud NOW() < pin_lock_until → 429 Too Many Requests.';
COMMENT ON COLUMN akce.pin_posledni_pokus_at IS
  'F-0021b: Timestamp posledního pokusu o PIN (pro sliding window rate limit).';

-- Žádný constraint XOR (pin_kod XOR pin_hash), protože oba mohou existovat
-- zároveň během transition period.

-- Rate limit sloupce jsou přidány pro případ, že rate limit půjde přes DB
-- (místo Redis/Upstash). Pokud půjde přes app-level memory / KV, tyto
-- sloupce zůstanou nepoužité, ale schema freeze je dodržen.

COMMIT;

-- ============================================================
-- Rollback plan (ruční):
--   BEGIN;
--   ALTER TABLE akce
--     DROP COLUMN IF EXISTS pin_posledni_pokus_at,
--     DROP COLUMN IF EXISTS pin_lock_until,
--     DROP COLUMN IF EXISTS pin_pokus_count,
--     DROP COLUMN IF EXISTS pin_hash;
--   COMMIT;
-- ============================================================
