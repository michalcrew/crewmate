"use server"

import { z } from "zod"
import { sendGmailMessage } from "@/lib/email/gmail-send"
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
    await sendGmailMessage({
      to: "team@crewmate.cz",
      subject: `Poptávka z webu — ${safe.jmeno}${safe.firma ? ` (${safe.firma})` : ""}`,
      bodyHtml: `
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
  } catch (err) {
    console.error("Contact form email error:", err)
  }

  return { success: true }
}
