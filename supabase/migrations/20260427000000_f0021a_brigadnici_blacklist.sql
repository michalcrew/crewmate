-- ============================================================
-- F-0021a — Brigádník blacklist flag (manuální admin blokace)
-- Datum:  2026-04-27
-- Epic:   E-0002 schema freeze (before 2026-05-15 cutover)
-- Důvod:  LG-5 z audit session — admin chce ručně zablokovat
--         problematického brigádníka, aby se neobjevoval v matrix
--         a pipeline listech. NEJEDNÁ SE o auto-block na základě ratingu —
--         rozhoduje vždy náborář/admin ručně.
--
-- Scope:
--   1) brigadnici.zablokovan_at          (timestamp kdy byl zablokován)
--   2) brigadnici.zablokovan_duvod       (volitelný důvod, text)
--   3) brigadnici.zablokoval_user_id     (autor blokace, FK users)
--   4) Partial index pro aktivní filter
--
-- Semantika:
--   - Všechny NULL = aktivní brigádník
--   - zablokovan_at IS NOT NULL = skryt z default listu/matrixu, v detailu
--     zobrazit červený badge + důvod
--   - Unblock = UPDATE SET zablokovan_at = NULL, zablokovan_duvod = NULL,
--     zablokoval_user_id = NULL (+ historie audit entry)
--
-- Relace k deleted_at (F-0016):
--   - deleted_at = brigádník ARCHIVOVAN (odešel, není aktivní zájemce)
--   - zablokovan_at = brigádník BLACKLISTED (admin ho nechce na akci)
--   - Brigádník může být oboje, jedno, nebo nic.
--
-- Destruktivní operace: žádná. Pouze additivní.
-- ============================================================

BEGIN;

ALTER TABLE brigadnici
  ADD COLUMN IF NOT EXISTS zablokovan_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS zablokovan_duvod   text        NULL,
  ADD COLUMN IF NOT EXISTS zablokoval_user_id uuid        NULL REFERENCES users(id) ON DELETE SET NULL;

-- Consistency constraint: když je zablokovan_at NOT NULL, musí být i autor.
-- Důvod nepovinný (admin nemusí vyplnit, ale mělo by se vyplňovat — to řeší UI).
ALTER TABLE brigadnici
  ADD CONSTRAINT brigadnici_zablokovan_konzistence
  CHECK (
    (zablokovan_at IS NULL AND zablokoval_user_id IS NULL)
    OR
    (zablokovan_at IS NOT NULL AND zablokoval_user_id IS NOT NULL)
  );

-- Partial index pro default listing "aktivní + neblokovaní"
CREATE INDEX IF NOT EXISTS idx_brigadnici_nezablokovani
  ON brigadnici (id)
  WHERE zablokovan_at IS NULL;

COMMENT ON COLUMN brigadnici.zablokovan_at IS
  'F-0021a LG-5: Timestamp ruční blokace (admin/náborář). NULL = aktivní. NOT NULL = skryt z matrix/listu, zobrazen červený badge.';
COMMENT ON COLUMN brigadnici.zablokovan_duvod IS
  'F-0021a: Volitelný důvod blokace (např. "nespolehlivý, 3× nepřišel"). Zobrazeno v detailu.';
COMMENT ON COLUMN brigadnici.zablokoval_user_id IS
  'F-0021a: Autor blokace (FK users). ON DELETE SET NULL — smazaný user → "Smazaný uživatel".';

COMMIT;

-- ============================================================
-- Rollback plan (ruční):
--   BEGIN;
--   ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_zablokovan_konzistence;
--   DROP INDEX IF EXISTS idx_brigadnici_nezablokovani;
--   ALTER TABLE brigadnici
--     DROP COLUMN IF EXISTS zablokoval_user_id,
--     DROP COLUMN IF EXISTS zablokovan_duvod,
--     DROP COLUMN IF EXISTS zablokovan_at;
--   COMMIT;
-- ============================================================
