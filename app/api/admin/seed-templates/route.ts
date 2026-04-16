import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/admin/seed-templates — One-time seed of email templates
 * Auth required (logged in user).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Check if templates already exist
  const { data: existing } = await admin
    .from("email_sablony")
    .select("id, typ")
    .in("typ", ["dpp", "prohlaseni", "dotaznik"])

  if (existing && existing.length >= 3) {
    return NextResponse.json({ ok: true, message: "Templates already exist", existing })
  }

  // Seed templates
  const templates = [
    {
      nazev: "DPP k podpisu",
      predmet: "DPP k podpisu — {{mesic}}",
      obsah_html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>v příloze Vám zasíláme <strong>Dohodu o provedení práce (DPP)</strong> na měsíc <strong>{{mesic}}</strong>.</p>
<div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
<p style="margin: 0 0 8px 0;"><strong>Jak postupovat:</strong></p>
<ol style="margin: 0; padding-left: 20px;">
<li>Otevřete přílohu (PDF)</li>
<li>Vytiskněte dokument</li>
<li>Podepište na vyznačeném místě</li>
<li>Naskenujte nebo vyfoťte celý podepsaný dokument</li>
<li>Pošlete zpět na tento email jako přílohu</li>
</ol>
</div>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>`,
      typ: "dpp",
      aktivni: true,
    },
    {
      nazev: "Prohlášení k podpisu",
      predmet: "Prohlášení poplatníka — {{mesic}}",
      obsah_html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>v příloze Vám zasíláme <strong>Prohlášení poplatníka daně</strong> (růžové prohlášení) na měsíc <strong>{{mesic}}</strong>.</p>
<div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
<p style="margin: 0 0 8px 0;"><strong>Jak postupovat:</strong></p>
<ol style="margin: 0; padding-left: 20px;">
<li>Otevřete přílohu (PDF)</li>
<li>Vyplňte datum a podpis</li>
<li>Naskenujte nebo vyfoťte celý podepsaný dokument</li>
<li>Pošlete zpět na tento email jako přílohu</li>
</ol>
</div>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>`,
      typ: "prohlaseni",
      aktivni: true,
    },
    {
      nazev: "Dotazník — osobní údaje",
      predmet: "Crewmate — vyplňte prosím osobní údaje",
      obsah_html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>pro dokončení registrace potřebujeme doplnit Vaše osobní údaje.</p>
<p>Klikněte prosím na odkaz níže a vyplňte dotazník:</p>
<div style="text-align: center; margin: 24px 0;">
<a href="{{odkaz_formular}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Vyplnit dotazník</a>
</div>
<p style="color: #666; font-size: 12px;">Odkaz je platný 30 dní.</p>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>`,
      typ: "dotaznik",
      aktivni: true,
    },
  ]

  const { data, error } = await admin
    .from("email_sablony")
    .upsert(templates, { onConflict: "typ" })
    .select("id, nazev, typ")

  if (error) {
    // typ column might not have unique constraint, use insert
    const { data: inserted, error: insertError } = await admin
      .from("email_sablony")
      .insert(templates)
      .select("id, nazev, typ")

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, templates: inserted })
  }

  return NextResponse.json({ ok: true, templates: data })
}
