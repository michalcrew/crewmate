-- Migration: F-0011 — Email & Document Management
-- Date: 2026-04-16
-- Tables: email_threads, email_messages, email_attachments, document_records, gmail_sync_state
-- Author: Data Agent (F-0011)

BEGIN;

-- ============================================================
-- 1. gmail_sync_state — Gmail API sync position tracking
-- ============================================================

CREATE TABLE gmail_sync_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address   text NOT NULL,
  last_history_id text,
  last_sync_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gmail_sync_state_unique_email UNIQUE (email_address)
);

CREATE TRIGGER set_updated_at_gmail_sync_state
  BEFORE UPDATE ON gmail_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE gmail_sync_state IS 'Tracks Gmail API sync position for incremental sync via historyId';

-- ============================================================
-- 2. email_threads — Conversation containers (synced with Gmail threads)
-- ============================================================

CREATE TABLE email_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id          uuid REFERENCES brigadnici(id) ON DELETE RESTRICT,  -- nullable for unmatched
  gmail_thread_id       text NOT NULL,
  subject               text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'nove'
    CHECK (status IN ('nove', 'ceka_na_brigadnika', 'ceka_na_nas', 'vyreseno')),
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text NOT NULL DEFAULT '',
  message_count         integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_threads_unique_gmail_thread UNIQUE (gmail_thread_id)
);

CREATE INDEX idx_email_threads_brigadnik_id ON email_threads (brigadnik_id);
CREATE INDEX idx_email_threads_status ON email_threads (status);
CREATE INDEX idx_email_threads_last_message_at ON email_threads (last_message_at DESC);

CREATE TRIGGER set_updated_at_email_threads
  BEFORE UPDATE ON email_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE email_threads IS 'Email conversation threads synced with Gmail. Status: nove, ceka_na_brigadnika, ceka_na_nas, vyreseno';

-- ============================================================
-- 3. email_messages — Individual emails within a thread
-- ============================================================

CREATE TABLE email_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  gmail_message_id  text NOT NULL,
  direction         text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  from_email        text NOT NULL,
  from_name         text,
  to_email          text NOT NULL,
  subject           text NOT NULL DEFAULT '',
  body_html         text NOT NULL DEFAULT '',
  body_text         text NOT NULL DEFAULT '',
  sent_at           timestamptz NOT NULL DEFAULT now(),
  sent_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,  -- null for inbound
  document_type     text CHECK (document_type IN ('dpp', 'prohlaseni', 'briefing', 'plain')),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_messages_unique_gmail_message UNIQUE (gmail_message_id)
);

CREATE INDEX idx_email_messages_thread_id ON email_messages (thread_id);
CREATE INDEX idx_email_messages_sent_at ON email_messages (sent_at DESC);

COMMENT ON TABLE email_messages IS 'Individual email messages within threads. direction: outbound (sent from Crewmate) or inbound (received)';

-- ============================================================
-- 4. email_attachments — Files attached to emails
-- ============================================================

CREATE TABLE email_attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  filename              text NOT NULL,
  mime_type             text NOT NULL,
  size_bytes            integer NOT NULL DEFAULT 0,
  storage_path          text NOT NULL,
  classified_as         text CHECK (classified_as IN (
                          'dpp', 'dpp_podpis', 'prohlaseni', 'prohlaseni_podpis', 'briefing', 'jiny'
                        )),
  classified_at         timestamptz,
  classified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT email_attachments_classification_consistency
    CHECK (
      (classified_as IS NULL AND classified_at IS NULL AND classified_by_user_id IS NULL)
      OR
      (classified_as IS NOT NULL AND classified_at IS NOT NULL AND classified_by_user_id IS NOT NULL)
    )
);

CREATE INDEX idx_email_attachments_message_id ON email_attachments (message_id);
CREATE INDEX idx_email_attachments_classified ON email_attachments (classified_as) WHERE classified_as IS NOT NULL;

COMMENT ON TABLE email_attachments IS 'Files attached to email messages (sent and received)';

-- ============================================================
-- 5. document_records — Per-document evidence per brigadník per month
-- ============================================================

CREATE TABLE document_records (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id            uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  mesic                   date NOT NULL,  -- always 1st of month
  typ                     text NOT NULL CHECK (typ IN ('dpp', 'prohlaseni')),
  stav                    text NOT NULL DEFAULT 'zadny'
    CHECK (stav IN ('zadny', 'vygenerovano', 'odeslano', 'podepsano')),
  email_message_id        uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  storage_path            text,
  received_attachment_id  uuid REFERENCES email_attachments(id) ON DELETE SET NULL,
  vygenerovano_at         timestamptz,
  odeslano_at             timestamptz,
  podepsano_at            timestamptz,
  -- AI fields (prepared for future, not used in V1)
  ai_review_status        text CHECK (ai_review_status IN ('pending', 'approved', 'rejected', 'needs_review')),
  ai_review_result        jsonb,
  ai_reviewed_at          timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_records_unique_per_month UNIQUE (brigadnik_id, mesic, typ),
  CONSTRAINT document_records_mesic_first_of_month CHECK (EXTRACT(DAY FROM mesic) = 1)
);

CREATE INDEX idx_document_records_brigadnik ON document_records (brigadnik_id);
CREATE INDEX idx_document_records_mesic ON document_records (mesic);
CREATE INDEX idx_document_records_stav ON document_records (stav);

CREATE TRIGGER set_updated_at_document_records
  BEFORE UPDATE ON document_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE document_records IS 'Document evidence per brigadník per calendar month. ai_review_* fields prepared for future AI integration.';

-- ============================================================
-- RLS — Same pattern as rest of the app: authenticated sees all
-- ============================================================

ALTER TABLE gmail_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_records ENABLE ROW LEVEL SECURITY;

-- gmail_sync_state
CREATE POLICY "authenticated_all_gmail_sync" ON gmail_sync_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- email_threads
CREATE POLICY "authenticated_read_threads" ON email_threads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_threads" ON email_threads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_threads" ON email_threads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- email_messages (immutable after creation — no UPDATE policy)
CREATE POLICY "authenticated_read_messages" ON email_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_messages" ON email_messages
  FOR INSERT TO authenticated WITH CHECK (true);

-- email_attachments
CREATE POLICY "authenticated_read_attachments" ON email_attachments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_attachments" ON email_attachments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_attachments" ON email_attachments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- document_records
CREATE POLICY "authenticated_read_doc_records" ON document_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_doc_records" ON document_records
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_doc_records" ON document_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMIT;
