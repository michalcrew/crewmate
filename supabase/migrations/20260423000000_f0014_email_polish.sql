-- Migration: F-0014 — Email & Komunikace Polish
-- Date: 2026-04-23
-- Author: Data Agent (F-0014)
-- Scope:
--   1) email_threads: is_read / archived + index + trigger (reset on incoming)
--   2) formular_tokeny: invalidated_at + invalidation_reason + constraints
--   3) Storage bucket `email-attachments` + RLS
--   4) email_sablony diakritika audit (idempotent re-seed, preserves edits)
--
-- Poznámka: tabulka `email_attachments` už existuje z F-0011
-- (migrace 20260416300000_email_feature.sql) s policies authenticated_read/insert/update.
-- V F-0014 jen přidáme DELETE policy (pro cleanup orphanů) + ověříme RLS.
--
-- Poznámka k `direction`: `email_messages.direction` má hodnoty 'inbound'|'outbound'.
-- Trigger v sekci 1 používá 'inbound' (ne `is_incoming=true` z product briefu).

BEGIN;

-- ============================================================
-- 1. email_threads — is_read + archived state (D-F0014-09)
-- ============================================================

ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS is_read      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by  uuid        NULL REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN email_threads.is_read     IS 'F-0014 (D-09): shared read state per-thread. Reset na false při příchozí zprávě (viz trigger).';
COMMENT ON COLUMN email_threads.archived    IS 'F-0014 (D-06): jen DB flag, žádný Gmail label sync v MVP. Auto-unarchive při příchozí zprávě.';
COMMENT ON COLUMN email_threads.archived_at IS 'F-0014: kdy byl thread archivován (nebo NULL).';
COMMENT ON COLUMN email_threads.archived_by IS 'F-0014: kdo archivoval (user).';

-- Partial index pro hlavní inbox view: nepřečtené a neArchivované, řazeno podle aktivity.
-- `last_message_at` (z F-0011) je přesnější než `updated_at` — updated_at se dotkne i při read/archive akcích.
CREATE INDEX IF NOT EXISTS idx_email_threads_unread_inbox
  ON email_threads (last_message_at DESC)
  WHERE is_read = false AND archived = false;

CREATE INDEX IF NOT EXISTS idx_email_threads_archived
  ON email_threads (archived, last_message_at DESC)
  WHERE archived = true;


-- ============================================================
-- 2. Trigger: reset_thread_on_incoming (D-F0014-07)
-- ============================================================
--   Při INSERT incoming message → thread se unarchive + označí unread.
--   Incoming = direction='inbound' (viz email_messages CHECK v F-0011).
--   Outbound zprávy nemění is_read (posílám = vím o tom).

CREATE OR REPLACE FUNCTION f0014_reset_thread_on_incoming()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE email_threads
      SET is_read     = false,
          archived    = false,
          archived_at = NULL,
          archived_by = NULL,
          updated_at  = now()
      WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION f0014_reset_thread_on_incoming() IS
  'F-0014 (D-07): Při INSERT inbound zprávy → unarchive + is_read=false.';

DROP TRIGGER IF EXISTS trg_f0014_reset_thread_on_incoming ON email_messages;
CREATE TRIGGER trg_f0014_reset_thread_on_incoming
  AFTER INSERT ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION f0014_reset_thread_on_incoming();


-- ============================================================
-- 3. formular_tokeny — invalidace audit (D-F0014-05)
-- ============================================================

ALTER TABLE formular_tokeny
  ADD COLUMN IF NOT EXISTS invalidated_at       timestamptz NULL,
  ADD COLUMN IF NOT EXISTS invalidation_reason  text        NULL;

COMMENT ON COLUMN formular_tokeny.invalidated_at      IS 'F-0014 (D-05): kdy byl token invalidován. NULL = stále platný (pokud expiruje_at > now()).';
COMMENT ON COLUMN formular_tokeny.invalidation_reason IS 'F-0014 (D-05): důvod invalidace. resend_requested | manual | expired.';

-- Enum-like CHECK na důvod
ALTER TABLE formular_tokeny DROP CONSTRAINT IF EXISTS formular_tokeny_invalidation_reason_check;
ALTER TABLE formular_tokeny
  ADD CONSTRAINT formular_tokeny_invalidation_reason_check
  CHECK (
    invalidation_reason IS NULL
    OR invalidation_reason IN ('resend_requested', 'manual', 'expired')
  );

-- Konzistence: invalidated_at a reason musí být set/unset společně
ALTER TABLE formular_tokeny DROP CONSTRAINT IF EXISTS formular_tokeny_invalidation_consistency;
ALTER TABLE formular_tokeny
  ADD CONSTRAINT formular_tokeny_invalidation_consistency
  CHECK (
    (invalidated_at IS NULL     AND invalidation_reason IS NULL)
    OR
    (invalidated_at IS NOT NULL AND invalidation_reason IS NOT NULL)
  );

-- Partial index pro aktivní (non-invalidated) tokeny — typický lookup při ověření /formular/[token].
CREATE INDEX IF NOT EXISTS idx_formular_tokeny_active
  ON formular_tokeny (token)
  WHERE invalidated_at IS NULL AND vyplneno = false;


-- ============================================================
-- 4. email_attachments — DELETE policy (cleanup orphanů)
-- ============================================================
--   Tabulka už existuje z F-0011 s read/insert/update policies.
--   Pro F-0014 přidáváme DELETE (orphan cleanup po failed send / composer close).
--   RLS zůstává "authenticated only" — anon nemá přístup.

DROP POLICY IF EXISTS "authenticated_delete_email_attachments" ON email_attachments;
CREATE POLICY "authenticated_delete_email_attachments"
  ON email_attachments
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- 5. Storage bucket `email-attachments` + RLS
-- ============================================================
--   Name: 'email-attachments' (dash convention pro Supabase Storage bucketů).
--   Public: false (private bucket, access jen přes signed URLs).
--   Path pattern: {thread_id}/{message_draft_id}/{random_uuid}_{sanitized_filename}
--   File size limit a allowed MIME types enforced v API route i client-side,
--   NE v bucket config (flexibilita pro defense-in-depth v Server Action).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 26214400)  -- 25 MiB
ON CONFLICT (id) DO NOTHING;

-- RLS na storage.objects pro tento bucket.
-- P0-4 (Security MUST #8) — pending/ path je OWNER-SCOPED: authenticated user
-- vidí/upload-uje jen do `pending/{users.id}/` vlastní složky. Cross-user
-- leakage (user A čte pending/userB/*) blokované i na RLS layer.
-- messages/ je sdílené (team member access) — reálné download-y jdou přes
-- signed URL vygenerovaný Server Action (service role), takže RLS na messages/
-- je jen defense-in-depth proti přímému anon/authenticated Storage API volání.
--
-- Mapping: upload handler v email-attachments.ts používá `internal users.id`
-- (ne auth.uid()). Proto path check překládá auth.uid() → users.id přes
-- sub-SELECT (`users.auth_user_id = auth.uid()`).

-- Helper — extrakce user ID z `pending/{userId}/...` path (2. segment).
-- Použitelný inline v USING/WITH CHECK. Segmentace přes storage.foldername(name).

DROP POLICY IF EXISTS "email_attachments_authenticated_select" ON storage.objects;
CREATE POLICY "email_attachments_authenticated_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (
      -- messages/ — sdílené pro team (reálně se jede přes signed URL admin)
      (storage.foldername(name))[1] = 'messages'
      OR (
        -- pending/ — jen own user_id prefix (mapping auth.uid → users.id)
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "email_attachments_authenticated_insert" ON storage.objects;
CREATE POLICY "email_attachments_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND (
      -- messages/ — insert-uje Server Action (admin), ne přímo authenticated;
      -- ale povolíme pro edge cases / future.
      (storage.foldername(name))[1] = 'messages'
      OR (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "email_attachments_authenticated_update" ON storage.objects;
CREATE POLICY "email_attachments_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (
      (storage.foldername(name))[1] = 'messages'
      OR (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND (
      (storage.foldername(name))[1] = 'messages'
      OR (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "email_attachments_authenticated_delete" ON storage.objects;
CREATE POLICY "email_attachments_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (
      (storage.foldername(name))[1] = 'messages'
      OR (
        (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] IN (
          SELECT id::text FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
    )
  );


-- ============================================================
-- 6. email_sablony — diakritika audit (D-F0014-04, sub-feature 1I)
-- ============================================================
--   Audit výsledek (k 2026-04-23):
--     - 20260417000000_email_templates_seed.sql obsahuje 3 šablony:
--       'DPP k podpisu', 'Prohlášení k podpisu', 'Dotazník — osobní údaje'
--     - Diakritika v textech OK (žádné "sicialnim"/"nashlenanu" patterns
--       zmíněné v product briefu — ty byly hypotetické příklady).
--     - F-0013 přidal platnost_od/platnost_do + CHECK constraint — OK.
--   Žádný UPDATE není potřeba. Pokud by v budoucnu seed měl překlepy,
--   opravit tam (INSERT ... ON CONFLICT DO NOTHING zachová custom edity).
--
--   Pro jistotu re-run idempotentního INSERT (už má ON CONFLICT DO NOTHING v F-0011 seed),
--   ale ne tady — zůstává jako component seed.

-- No-op; pouze dokumentace auditu:
COMMENT ON TABLE email_sablony IS
  'Email šablony. F-0014 audit (2026-04-23): diakritika OK, žádný UPDATE potřeba. Seed v 20260417000000_email_templates_seed.sql je idempotentní (ON CONFLICT DO NOTHING).';


COMMIT;
