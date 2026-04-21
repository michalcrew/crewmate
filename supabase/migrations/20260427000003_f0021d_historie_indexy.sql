-- ============================================================
-- F-0021d — historie indexy pro audit log UI
-- Datum:  2026-04-27
-- Epic:   E-0002 schema freeze
-- Důvod:  MD-10 z auditu — post-MVP audit log UI (`/app/audit-log`)
--         potřebuje rychlé filtry per user + per akce + per nabidka.
--         Existující indexy (brigadnik_id, typ, created_at) pokrývají
--         jen část queries; chybí user_id, akce_id, nabidka_id.
--         Přidáváme v schema freeze aby post-MVP UI nemuselo čekat
--         na další migraci.
--
-- Scope:
--   1) idx_historie_user      — filtr "kdo co udělal"
--   2) idx_historie_akce      — filtr per akce
--   3) idx_historie_nabidka   — filtr per zakázka
--   4) Kompozitní (typ, created_at) pro "posledních 50 pipeline_zmena"
--      v audit filtru. Stávající idx_historie_typ je jen na typ.
--
-- Destruktivní operace: žádná.
-- Performance impact: INSERT/UPDATE na historie bude marginálně pomalejší
--   (4 nové indexy), ale tabulka je append-only a nízkofrekvenční
--   (max pár set insertů denně), takže negligible.
--
-- Alternativa zvažována: CREATE INDEX CONCURRENTLY. V Supabase SQL editoru
--   nelze spustit v transakci. Alternativa je spustit mimo BEGIN;COMMIT
--   blok. Protože tabulka je malá (< 100k řádků), standard CREATE INDEX
--   v transakci je OK a locking impact je < 1s. Pokud by tabulka rostla
--   výrazně, rozbít na 4 samostatná CONCURRENTLY runy mimo transakci.
-- ============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_historie_user
  ON historie (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historie_akce
  ON historie (akce_id, created_at DESC)
  WHERE akce_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historie_nabidka
  ON historie (nabidka_id, created_at DESC)
  WHERE nabidka_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historie_typ_created
  ON historie (typ, created_at DESC);

COMMIT;

-- ============================================================
-- Rollback plan (ruční):
--   BEGIN;
--   DROP INDEX IF EXISTS idx_historie_user;
--   DROP INDEX IF EXISTS idx_historie_akce;
--   DROP INDEX IF EXISTS idx_historie_nabidka;
--   DROP INDEX IF EXISTS idx_historie_typ_created;
--   COMMIT;
-- ============================================================
