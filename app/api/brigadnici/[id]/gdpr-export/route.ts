import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * MD-11 — GDPR čl. 15 (právo na přístup) export endpoint.
 *
 * Vrací kompletní JSON dump všech dat o brigádníkovi napříč relační
 * strukturou. Vhodné pro:
 *  - Subject Access Request (SAR) — brigádník žádá o kopii svých dat.
 *  - Interní audit.
 *  - Příprava erasure (MD-11 anonymize flow) — admin dump před provedením.
 *
 * Auth: admin only. Náborářka NE (nevidí PII ostatních náborářů).
 *
 * Citlivé údaje:
 *  - RČ, OP, DIČ jsou v DB šifrovány (AES-256-GCM). Export vrací
 *    **šifrovaný** text. Pokud je potřeba cleartext, nechť
 *    SAR process má další krok dešifrování v controlled prostředí
 *    (Supabase Edge + service role vault). MVP: return ciphertext +
 *    poznámka v response.
 *  - Podpisy / dokumenty v Storage (DPP, prohlášení) nejsou v tomto
 *    endpointu — vrací se pouze URLs / storage paths. Podepsané PDF
 *    lze stáhnout samostatně s admin signed URL.
 *
 * Rate limit: není (admin endpoint, low frequency), ale Vercel edge
 * default stačí.
 *
 * Response: JSON se všemi tabulkami vázanými na brigadnik_id.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: brigadnikId } = await context.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Role check — admin only. Používáme admin client jako fallback (stejný
  // pattern jako getCurrentUserRole po MD-1 fixu) pro edge case kdy RLS
  // SELECT vrátí null.
  const adminClientForRole = createAdminClient()
  const { data: me } = await adminClientForRole
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single()

  if (!me || (me as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // UUID sanity
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brigadnikId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Core brigadnik record (všechny sloupce — včetně encrypted PII ciphertexts)
  const { data: brigadnik, error: brigadnikErr } = await admin
    .from("brigadnici")
    .select("*")
    .eq("id", brigadnikId)
    .single()

  if (brigadnikErr || !brigadnik) {
    return NextResponse.json({ error: "Brigádník nenalezen" }, { status: 404 })
  }

  // Související tabulky — paralelně pro rychlost.
  const [
    pipeline,
    prirazeni,
    dochazka,
    hodnoceni,
    smluvniStav,
    emailThreads,
    emailMessages,
    documentRecords,
    formularTokeny,
    historie,
  ] = await Promise.all([
    admin.from("pipeline_entries")
      .select("*, nabidka:nabidky(id, nazev, typ)")
      .eq("brigadnik_id", brigadnikId),
    admin.from("prirazeni")
      .select("*, akce:akce(id, nazev, datum)")
      .eq("brigadnik_id", brigadnikId),
    admin.from("dochazka")
      .select("*, akce:akce(nazev, datum)")
      .eq("brigadnik_id", brigadnikId),
    admin.from("hodnoceni_brigadnika")
      .select("*")
      .eq("brigadnik_id", brigadnikId),
    admin.from("smluvni_stav")
      .select("*")
      .eq("brigadnik_id", brigadnikId),
    admin.from("email_threads")
      .select("*")
      .eq("brigadnik_id", brigadnikId),
    admin.from("email_messages")
      .select("id, thread_id, direction, from_email, to_email, subject, sent_at, document_type, body_text")
      .in(
        "thread_id",
        (
          await admin
            .from("email_threads")
            .select("id")
            .eq("brigadnik_id", brigadnikId)
        ).data?.map((t) => (t as { id: string }).id) ?? [],
      ),
    admin.from("document_records")
      .select("*")
      .eq("brigadnik_id", brigadnikId),
    admin.from("formular_tokeny")
      .select("id, created_at, invalidated_at, used_at")
      .eq("brigadnik_id", brigadnikId),
    admin.from("historie")
      .select("*")
      .eq("brigadnik_id", brigadnikId)
      .order("created_at", { ascending: false }),
  ])

  // Audit log: kdo exportoval kdy
  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: (me as { id?: string }).id ?? null,
    typ: "gdpr_export",
    popis: `GDPR export JSON (čl. 15) — ${user.email ?? "?"}`,
    metadata: {
      actor_auth_id: user.id,
      actor_email: user.email,
    },
  })

  return NextResponse.json(
    {
      export_info: {
        generated_at: new Date().toISOString(),
        generated_by: user.email,
        gdpr_article: "15",
        notes:
          "Šifrované sloupce (rodne_cislo, cislo_op, osvc_dic) jsou vráceny jako " +
          "ciphertext. Pro dešifrování kontaktujte DPO / správce systému. " +
          "Storage (DPP/prohlášení PDF) není součástí exportu — storage_path odkazy " +
          "najdete v documents.storage_path, stažení přes Supabase Storage signed URL.",
      },
      brigadnik,
      pipeline_entries: pipeline.data ?? [],
      prirazeni: prirazeni.data ?? [],
      dochazka: dochazka.data ?? [],
      hodnoceni: hodnoceni.data ?? [],
      smluvni_stav: smluvniStav.data ?? [],
      email_threads: emailThreads.data ?? [],
      email_messages: emailMessages.data ?? [],
      documents: documentRecords.data ?? [],
      formular_tokeny: formularTokeny.data ?? [],
      historie: historie.data ?? [],
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="gdpr-export-${brigadnikId}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    },
  )
}
