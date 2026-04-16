// F-0011 Email & Document Management — TypeScript types

// --- Enums ---

export type ConversationStatus = 'nove' | 'ceka_na_brigadnika' | 'ceka_na_nas' | 'vyreseno'

export type DocumentSendType = 'dpp' | 'prohlaseni' | 'briefing' | 'plain'

export type MessageDirection = 'outbound' | 'inbound'

export type DocumentEvidenceStatus = 'zadny' | 'vygenerovano' | 'odeslano' | 'podepsano'

export type AttachmentClassification =
  | 'dpp' | 'dpp_podpis'
  | 'prohlaseni' | 'prohlaseni_podpis'
  | 'briefing' | 'jiny'

// --- Core Types ---

export interface EmailThread {
  id: string
  brigadnik_id: string | null
  gmail_thread_id: string
  subject: string
  status: ConversationStatus
  last_message_at: string
  last_message_preview: string
  message_count: number
  created_at: string
  updated_at: string
  // Joined
  brigadnik?: {
    id: string
    jmeno: string
    prijmeni: string
    email: string
  }
}

export interface EmailMessage {
  id: string
  thread_id: string
  gmail_message_id: string
  direction: MessageDirection
  from_email: string
  from_name: string | null
  to_email: string
  subject: string
  body_html: string
  body_text: string
  sent_at: string
  sent_by_user_id: string | null
  document_type: DocumentSendType | null
  created_at: string
  // Joined
  attachments?: EmailAttachment[]
  sent_by?: { id: string; jmeno: string; prijmeni: string }
}

export interface EmailAttachment {
  id: string
  message_id: string
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string
  classified_as: AttachmentClassification | null
  classified_at: string | null
  classified_by_user_id: string | null
  created_at: string
}

export interface DocumentRecord {
  id: string
  brigadnik_id: string
  mesic: string
  typ: 'dpp' | 'prohlaseni'
  stav: DocumentEvidenceStatus
  email_message_id: string | null
  storage_path: string | null
  received_attachment_id: string | null
  vygenerovano_at: string | null
  odeslano_at: string | null
  podepsano_at: string | null
  ai_review_status: string | null
  ai_review_result: unknown | null
  ai_reviewed_at: string | null
  created_at: string
  updated_at: string
}

// --- Action Inputs ---

export interface SendEmailInput {
  brigadnik_id: string
  subject: string
  body_html: string
  attachment_ids?: string[]
  document_type?: DocumentSendType
}

export interface SendDocumentInput {
  brigadnik_id: string
  document_type: 'dpp' | 'prohlaseni'
  mesic: string // YYYY-MM-01
  body_html: string
}

export interface ClassifyAttachmentInput {
  attachment_id: string
  classified_as: AttachmentClassification
  mesic?: string
}

export interface UpdateConversationInput {
  thread_id: string
  status: ConversationStatus
}

// --- Action Outputs ---

export interface SendEmailResult {
  success: boolean
  thread_id?: string
  message_id?: string
  error?: string
  missing_fields?: string[]
}

export interface ThreadListResult {
  threads: EmailThread[]
  total: number
}

export interface ThreadDetailResult {
  thread: EmailThread
  messages: EmailMessage[]
}
