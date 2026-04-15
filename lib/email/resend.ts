import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const { error } = await resend.emails.send({
    from: "Crewmate <onboarding@resend.dev>", // TODO: change to team@crewmate.cz after domain verification
    to,
    subject,
    html,
  })

  if (error) {
    console.error("Email send error:", error)
    throw new Error(error.message)
  }
}
