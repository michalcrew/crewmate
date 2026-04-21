-- ============================================================
-- F-0021e — GDPR anonymizace metadata (čl. 17 erasure)
-- Datum:  2026-04-27
-- Epic:   E-0002 schema freeze
-- Důvod:  MD-11 z auditu — GDPR čl. 17 právo na výmaz.
--         U brigádníka s DPP historií NELZE smazat identifikační údaje
--         (zákoník práce + daňový řád: archivace 10 let). Erasure =
--         anonymizace kontaktních údajů + skrytí z UI, core identity
--         zůstává pro právní retenci.
--
-- Scope (schema-only, logika erasure je v kódu post-freeze):
--   1) erasure_requested_at     — kdy přišla GDPR žádost (čl. 12(3):
--                                 30denní lhůta pro odpověď)
--   2) anonymizovan_at          — kdy byla provedena erasure
--   3) anonymizoval_user_id     — kdo provedl erasure
--   4) uchovat_do               — datum, po kterém lze hard-delete
--                                 (typicky MAX(DPP_rok) + 10 let)
--
-- Vztah k existujícím sloupcům:
--   - deleted_at (F-0016): obecný soft-delete/archivace (odešel, neaktivní)
--   - zablokovan_at (F-0021a): manuální blacklist (admin ne chce)
--   - anonymizovan_at (F-0021e): GDPR erasure proveden (kontaktní údaje zmazány)
--   Brigádník může být kombinací — např. archivován (deleted_at)
--   A GDPR-anonymizován (anonymizovan_at) současně.
--
-- Erasure flow (implementace v aplikaci, mimo scope této migrace):
--   1. Admin klikne "Smazat osobní údaje" v detailu.
--   2. Confirm dialog vyjmenuje co zmizí a co NELZE smazat (podle
--      existence DPP záznamů).
--   3. Server action — audit všech FK tabulek s brigadnik_id:
--      a) Má DPP historii → UPDATE brigadnici SET
--         email=NULL, telefon=NULL, korespondencni_adresa=NULL,
--         zdravotni_pojistovna=NULL, poznamky=NULL, foto_url=NULL, cv_url=NULL,
--         anonymizovan_at=NOW(), anonymizoval_user_id=?,
--         uchovat_do = (MAX(rok) FROM smluvni_stav) + 10 let;
--         + UPDATE hodnoceni_brigadnika SET poznamka=NULL WHERE ...;
--         + UPDATE pipeline_entries SET poznamky=NULL WHERE ...;
--         + UPDATE email_threads / email_messages (preview/body) — jen smazat body/preview text
--           kde je PII; subject zachovat pro audit.
--         + UPDATE document_records: storage_path zachovat (10 let retence DPP),
--           ale zvážit reencrypt s novým klíčem.
--         + UPDATE historie: pouze přidat novou entry, existující NEMAZAT (audit log).
--         JMÉNO + PŘÍJMENÍ + RČ + OP + DATUM NAROZENÍ + ADRESA TRVALÁ zůstávají
--         (právní požadavek daňového řádu).
--      b) Nemá DPP → UPDATE SET všechno kromě jmeno='Smazaný brigádník',
--         prijmeni='#' || id.toString()[:8], uchovat_do=NULL (lze hard-delete kdykoliv).
--   POZN.: Úplný seznam FK tabulek je nutné projít před implementací erasure
--   kódu, nové tabulky po freeze jsou málo pravděpodobné. Stav k F-0021e:
--   brigadnici ← pipeline_entries, prirazeni, dochazka, hodnoceni_brigadnika,
--                 smluvni_stav, email_threads, document_records, historie,
--                 formular_tokeny.
--   4. Historie entry: typ='gdpr_erasure', metadata={before_diff}.
--   5. Scheduled job (post-MVP pg_cron): jednou ročně DELETE řádky
--      kde uchovat_do < NOW() — hard delete po retenci.
--
-- Destruktivní operace: žádná (jen metadata sloupce).
-- ============================================================

BEGIN;

ALTER TABLE brigadnici
  ADD COLUMN IF NOT EXISTS erasure_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS anonymizovan_at      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS anonymizoval_user_id uuid        NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uchovat_do           date        NULL;

-- Consistency: pokud anonymizovan_at NOT NULL, musí být autor (uchovat_do
-- může být NULL pro brigádníka bez DPP — hard delete kdykoliv).
ALTER TABLE brigadnici
  ADD CONSTRAINT brigadnici_anonymize_konzistence
  CHECK (
    (anonymizovan_at IS NULL AND anonymizoval_user_id IS NULL)
    OR
    (anonymizovan_at IS NOT NULL AND anonymizoval_user_id IS NOT NULL)
  );

-- Konzistence: pokud je anonymizováno, muselo být i požádáno (historicky
-- první) — ale žádost bez anonymizace je OK (30denní window).
ALTER TABLE brigadnici
  ADD CONSTRAINT brigadnici_erasure_order
  CHECK (
    anonymizovan_at IS NULL
    OR erasure_requested_at IS NULL  -- legacy data (erasure udělaná před F-0021e)
    OR erasure_requested_at <= anonymizovan_at
  );

-- Partial index pro scheduled hard-delete job
CREATE INDEX IF NOT EXISTS idx_brigadnici_uchovat_do
  ON brigadnici (uchovat_do)
  WHERE uchovat_do IS NOT NULL;

-- Partial index pro GDPR reporting "kolik erasure requestů za měsíc"
CREATE INDEX IF NOT EXISTS idx_brigadnici_anonymizovan
  ON brigadnici (anonymizovan_at DESC)
  WHERE anonymizovan_at IS NOT NULL;

-- Index pro monitoring pending erasure requestů (30denní lhůta)
CREATE INDEX IF NOT EXISTS idx_brigadnici_erasure_pending
  ON brigadnici (erasure_requested_at)
  WHERE erasure_requested_at IS NOT NULL AND anonymizovan_at IS NULL;

COMMENT ON COLUMN brigadnici.erasure_requested_at IS
  'F-0021e MD-11: Timestamp přijetí GDPR čl. 17 žádosti. Startuje 30denní lhůtu dle čl. 12(3). Anonymizace (anonymizovan_at) musí být provedena do této lhůty.';
COMMENT ON COLUMN brigadnici.anonymizovan_at IS
  'F-0021e MD-11: GDPR čl. 17 erasure timestamp — KDY byla anonymizace provedena. Kontaktní údaje zmazány, core identity (pro právní retenci) zachována. NULL = nebyla provedena erasure.';
COMMENT ON COLUMN brigadnici.anonymizoval_user_id IS
  'F-0021e: Kdo provedl erasure. ON DELETE SET NULL. Audit trail v historie.';
COMMENT ON COLUMN brigadnici.uchovat_do IS
  'F-0021e: Datum konce právní retence (obvykle MAX(rok DPP) + 10 let). Po tomto datu scheduled job může hard-delete. NULL = nikdy neměl DPP, lze smazat kdykoliv.';

-- Rozšíření COMMENTu na historie.typ o nový typ gdpr_erasure
COMMENT ON COLUMN historie.typ IS
  'Values: pipeline_zmena, email_odeslan, dotaznik_vyplnen, dpp_vygenerovano, dokument_nahran, prirazeni_zmena, dochazka_zapsana, smluvni_stav_archiv_f0013, akce_zrusena, brigadnik_osobni_udaje_change, brigadnik_typ_zmena, brigadnik_osvc_field_zmena, hodnoceni_pridano, hodnoceni_upraveno, hodnoceni_smazano, brigadnik_zablokovan, brigadnik_odblokovan, gdpr_erasure';

COMMIT;

-- ============================================================
-- Rollback plan (ruční):
--   BEGIN;
--   DROP INDEX IF EXISTS idx_brigadnici_erasure_pending;
--   DROP INDEX IF EXISTS idx_brigadnici_uchovat_do;
--   DROP INDEX IF EXISTS idx_brigadnici_anonymizovan;
--   ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_erasure_order;
--   ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_anonymize_konzistence;
--   ALTER TABLE brigadnici
--     DROP COLUMN IF EXISTS uchovat_do,
--     DROP COLUMN IF EXISTS anonymizoval_user_id,
--     DROP COLUMN IF EXISTS anonymizovan_at,
--     DROP COLUMN IF EXISTS erasure_requested_at;
--   COMMIT;
-- ============================================================
