-- ============================================================
-- F-0013 / HF4 — users.pridat_logo flag
-- Datum: 2026-04-22
-- Důvod: User chce volitelně prependovat Crewmate logo do email podpisu.
--         Flag se čte v sendEmailAction / sendDocumentAction a pokud true,
--         před podpisem se insertne <img src="/logo-crewmate.svg" …>.
-- RLS:   žádné změny — nová kolona dědí existující politiky users.
-- ============================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pridat_logo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.pridat_logo IS
  'HF4: Pokud true, email pipeline prependuje Crewmate logo (img tag na /logo-crewmate.svg) před users.podpis. Default false.';

COMMIT;
