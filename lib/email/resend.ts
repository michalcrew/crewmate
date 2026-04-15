import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

type Attachment = {
  filename: string
  content: Buffer
  contentType?: string
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string
  subject: string
  html: string
  attachments?: Attachment[]
}) {
  const { error } = await resend.emails.send({
    from: "Crewmate <onboarding@resend.dev>", // TODO: change to team@crewmate.cz after domain verification
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
