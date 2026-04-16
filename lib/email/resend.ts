import { Resend } from "resend"
import { createTransport, type Transporter } from "nodemailer"

type Attachment = {
  filename: string
  content: Buffer
  contentType?: string
}

type SendEmailParams = {
  to: string
  subject: string
  html: string
  attachments?: Attachment[]
}

// Detect which email provider to use based on env variables
const EMAIL_PROVIDER = process.env.GMAIL_USER ? "gmail" : "resend"
const EMAIL_FROM = process.env.EMAIL_FROM ?? (
  EMAIL_PROVIDER === "gmail"
    ? `Crewmate <${process.env.GMAIL_USER}>`
    : "Crewmate <onboarding@resend.dev>"
)

// Gmail SMTP transport (lazy init)
let gmailTransport: Transporter | null = null

function getGmailTransport(): Transporter {
  if (!gmailTransport) {
    gmailTransport = createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // Google App Password (not regular password)
      },
    })
  }
  return gmailTransport
}

// Resend client (lazy init)
let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

export async function sendEmail({ to, subject, html, attachments }: SendEmailParams) {
  if (EMAIL_PROVIDER === "gmail") {
    return sendViaGmail({ to, subject, html, attachments })
  }
  return sendViaResend({ to, subject, html, attachments })
}

async function sendViaGmail({ to, subject, html, attachments }: SendEmailParams) {
  const transport = getGmailTransport()

  await transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    attachments: attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })
}

async function sendViaResend({ to, subject, html, attachments }: SendEmailParams) {
  const resend = getResend()

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    attachments: attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  if (error) {
    console.error("Email send error:", error)
    throw new Error(error.message)
  }
}
