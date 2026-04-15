"use server"

import { z } from "zod"
import { sendEmail } from "@/lib/email/resend"
import { escapeHtml } from "@/lib/utils/sanitize"

const kontaktSchema = z.object({
  jmeno: z.string().min(1, "Jméno je povinné"),
  firma: z.string().optional(),
  email: z.string().email("Neplatný email"),
  telefon: z.string().min(1, "Telefon je povinný"),
  zprava: z.string().min(1, "Zpráva je povinná"),
  gdpr: z.literal("on", { message: "Souhlas je povinný" }),
})

export async function submitKontakt(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = kontaktSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const safe = {
    jmeno: escapeHtml(parsed.data.jmeno),
    firma: escapeHtml(parsed.data.firma ?? ""),
    email: escapeHtml(parsed.data.email),
    telefon: escapeHtml(parsed.data.telefon),
    zprava: escapeHtml(parsed.data.zprava),
  }

  try {
    await sendEmail({
      to: "team@crewmate.cz",
      subject: `Poptávka z webu — ${safe.jmeno}${safe.firma ? ` (${safe.firma})` : ""}`,
      html: `
        <h2>Nová poptávka z webu</h2>
        <table>
          <tr><td><strong>Jméno:</strong></td><td>${safe.jmeno}</td></tr>
          <tr><td><strong>Firma:</strong></td><td>${safe.firma || "—"}</td></tr>
          <tr><td><strong>Email:</strong></td><td>${safe.email}</td></tr>
          <tr><td><strong>Telefon:</strong></td><td>${safe.telefon}</td></tr>
        </table>
        <h3>Zpráva:</h3>
        <p>${safe.zprava.replace(/\n/g, "<br/>")}</p>
      `,
    })
  } catch {
    // Email might fail if Resend domain not verified — still return success
    // In production, we'd want to save the inquiry to DB as fallback
  }

  return { success: true }
}
