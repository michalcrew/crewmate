import { sendGmailMessage } from "@/lib/email/gmail-send"
import { TWO_FA_CODE_TTL_MIN } from "./config"

export async function sendTwoFactorEmail(to: string, code: string): Promise<void> {
  const subject = `Crewmate – ověřovací kód ${code}`
  const bodyHtml = `
<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 18px; margin: 0 0 16px;">Ověřovací kód</h1>
  <p style="margin: 0 0 16px; color: #374151;">Použij tento kód k dokončení přihlášení do Crewmate:</p>
  <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 24px; background: #F3F4F6; border-radius: 8px; text-align: center; font-family: 'SF Mono', Menlo, monospace; color: #111827;">
    ${code}
  </div>
  <p style="margin: 16px 0 0; color: #6B7280; font-size: 13px;">Kód platí ${TWO_FA_CODE_TTL_MIN} minut. Pokud jsi se nepřihlašoval(a), kód ignoruj — někdo zkouší přístup k tvému účtu.</p>
  <p style="margin: 24px 0 0; color: #9CA3AF; font-size: 12px;">Crewmate s.r.o.</p>
</body>
</html>
`
  await sendGmailMessage({ to, subject, bodyHtml })
}
