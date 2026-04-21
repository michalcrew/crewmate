import { getGmailClient, getGmailUserEmail_ } from "./gmail-client"

interface GmailAttachment {
  filename: string
  content: Buffer
  mimeType: string
}

interface SendGmailParams {
  to: string
  cc?: string[]                   // F-0014 ADR-1A: reply-all support
  subject: string
  bodyHtml: string
  attachments?: GmailAttachment[]
  threadId?: string // for replies within existing thread
}

interface SendGmailResult {
  messageId: string
  threadId: string
}

/**
 * Build RFC 2822 MIME message with optional attachments
 */
function buildMimeMessage(params: {
  from: string
  to: string
  cc?: string[]
  subject: string
  bodyHtml: string
  attachments?: GmailAttachment[]
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const hasAttachments = params.attachments && params.attachments.length > 0

  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
  ]
  if (params.cc && params.cc.length > 0) {
    headers.push(`Cc: ${params.cc.join(", ")}`)
  }
  headers.push(
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
  )

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  } else {
    headers.push(`Content-Type: text/html; charset=UTF-8`)
    headers.push(`Content-Transfer-Encoding: base64`)
  }

  let message = headers.join("\r\n") + "\r\n\r\n"

  if (hasAttachments) {
    // HTML body part
    message += `--${boundary}\r\n`
    message += `Content-Type: text/html; charset=UTF-8\r\n`
    message += `Content-Transfer-Encoding: base64\r\n\r\n`
    message += Buffer.from(params.bodyHtml).toString("base64") + "\r\n"

    // Attachment parts
    for (const att of params.attachments!) {
      message += `--${boundary}\r\n`
      message += `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n`
      message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`
      message += `Content-Transfer-Encoding: base64\r\n\r\n`
      message += att.content.toString("base64") + "\r\n"
    }

    message += `--${boundary}--`
  } else {
    message += Buffer.from(params.bodyHtml).toString("base64")
  }

  return message
}

/**
 * Send email via Gmail API. Returns Gmail message ID and thread ID.
 */
export async function sendGmailMessage(params: SendGmailParams): Promise<SendGmailResult> {
  const gmail = getGmailClient()
  const fromEmail = getGmailUserEmail_()

  const raw = buildMimeMessage({
    from: `Crewmate <${fromEmail}>`,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    attachments: params.attachments,
  })

  // Base64url encode the MIME message
  const encodedMessage = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: params.threadId || undefined,
    },
  })

  if (!response.data.id || !response.data.threadId) {
    throw new Error("Gmail API returned no message ID or thread ID")
  }

  return {
    messageId: response.data.id,
    threadId: response.data.threadId,
  }
}
