"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const akceSchema = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  datum: z.string().min(1, "Datum je povinné"),
  cas_od: z.string().optional(),
  cas_do: z.string().optional(),
  misto: z.string().optional(),
  klient: z.string().optional(),
  nabidka_id: z.string().optional(),
  pocet_lidi: z.coerce.number().int().positive().optional(),
  poznamky: z.string().optional(),
})

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function getAkce(filter?: { mesic?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev), prirazeni_count:prirazeni(count)")
    .order("datum", { ascending: false })

  if (filter?.mesic) {
    const start = `${filter.mesic}-01`
    const [y, m] = filter.mesic.split("-").map(Number)
    const nextM = (m ?? 0) === 12 ? 1 : (m ?? 0) + 1; const nextY = (m ?? 0) === 12 ? (y ?? 0) + 1 : (y ?? 0); const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    query = query.gte("datum", start).lt("datum", end)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAkceByNabidka(nabidkaId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("akce")
    .select("*, prirazeni(id, brigadnik_id, pozice, status, brigadnik:brigadnici(id, jmeno, prijmeni))")
    .eq("nabidka_id", nabidkaId)
    .order("datum", { ascending: true })
  return data ?? []
}

export async function createAkce(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = akceSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // F-0012 guards
  if (parsed.data.nabidka_id) {
    const { data: nabidka } = await supabase
      .from("nabidky")
      .select("typ")
      .eq("id", parsed.data.nabidka_id)
      .single()

    if (!nabidka) return { error: "Zakázka nenalezena" }
    if (nabidka.typ === "ukoncena") {
      return { error: "K ukončené zakázce nelze přidávat akce" }
    }
    if (nabidka.typ === "jednodenni") {
      const { count } = await supabase
        .from("akce")
        .select("id", { count: "exact", head: true })
        .eq("nabidka_id", parsed.data.nabidka_id)
      if ((count ?? 0) >= 1) {
        return { error: "Jednodenní zakázka už má svoji akci. Vytvořte opakovanou zakázku pro více akcí." }
      }
    }
  }

  const { data: inserted, error } = await supabase.from("akce").insert({
    ...parsed.data,
    cas_od: parsed.data.cas_od || null,
    cas_do: parsed.data.cas_do || null,
    nabidka_id: parsed.data.nabidka_id || null,
    pin_kod: generatePin(),
  }).select("id").single()

  if (error) return { error: error.message }

  // Audit log
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  await supabase.from("historie").insert({
    akce_id: inserted?.id,
    nabidka_id: parsed.data.nabidka_id || null,
    user_id: internalUser?.id,
    typ: "akce_vytvorena",
    popis: `Vytvořena akce "${parsed.data.nazev}" (${parsed.data.datum})`,
  })

  revalidatePath("/app/akce")
  if (parsed.data.nabidka_id) revalidatePath(`/app/nabidky/${parsed.data.nabidka_id}`)
  return { success: true, id: inserted?.id }
}

export async function getAkceById(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev)")
    .eq("id", id)
    .single()
  return data
}

export async function getAkcePrirazeni(akceId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("prirazeni")
    .select(`
      *,
      brigadnik:brigadnici(id, jmeno, prijmeni, telefon, email),
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .order("status", { ascending: true })
    .order("poradi_nahradnik", { ascending: true })

  return data ?? []
}

export async function addPrirazeni(akceId: string, brigadnikId: string, pozice: string, status: string = "prirazeny") {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { error } = await supabase.from("prirazeni").insert({
    akce_id: akceId,
    brigadnik_id: brigadnikId,
    pozice: pozice || null,
    status,
  })

  if (error) {
    if (error.code === "23505") return { error: "Brigádník je již přiřazený na tuto akci" }
    return { error: error.message }
  }

  // Get internal user + brigadnik name for audit log
  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("jmeno, prijmeni")
    .eq("id", brigadnikId)
    .single()

  const { data: akce } = await supabase
    .from("akce")
    .select("nazev, nabidka_id")
    .eq("id", akceId)
    .single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce?.nabidka_id,
    user_id: internalUser?.id,
    typ: "prirazeni_zmena",
    popis: `${brigadnik?.prijmeni} ${brigadnik?.jmeno} přiřazen/a na ${akce?.nazev ?? "akci"} (${status})`,
  })

  revalidatePath(`/app/akce/${akceId}`)
  if (akce?.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

// ================================================================
// F-0012: assign brigadnik from pipeline to akce (multi-container DnD)
// ================================================================

export async function assignBrigadnikToAkce(
  akceId: string,
  brigadnikId: string,
  pozice?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Load akce + parent nabidka
  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, nabidka_id, nabidka:nabidky(typ)")
    .eq("id", akceId)
    .single()

  if (!akce) return { error: "Akce nenalezena" }
  if (!akce.nabidka_id) return { error: "Akce není přiřazená k zakázce" }
  const nabidka = akce.nabidka as unknown as { typ: string } | null
  if (nabidka?.typ === "ukoncena") {
    return { error: "Ukončená zakázka — nelze přiřazovat brigádníky" }
  }

  // Pipeline guard — brigadnik musí být v pipeline téže zakázky a ve správném stavu
  const { data: pipelineEntry } = await supabase
    .from("pipeline_entries")
    .select("stav")
    .eq("brigadnik_id", brigadnikId)
    .eq("nabidka_id", akce.nabidka_id)
    .single()

  if (!pipelineEntry) {
    return { error: "Brigádník není v pipeline této zakázky" }
  }
  if (!["prijaty_nehotova_admin", "prijaty_vse_vyreseno"].includes(pipelineEntry.stav)) {
    return { error: "Brigádník musí být ve stavu 'Přijatý' než bude přiřazen na akci" }
  }

  // Insert přiřazení (silent no-op on duplicate)
  const { error } = await supabase.from("prirazeni").insert({
    akce_id: akceId,
    brigadnik_id: brigadnikId,
    pozice: pozice || null,
    status: "prirazeny",
  })

  if (error) {
    if (error.code === "23505") {
      // Already assigned — silent
      return { success: true, duplicate: true }
    }
    return { error: error.message }
  }

  // Audit
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  const { data: brigadnik } = await supabase
    .from("brigadnici").select("jmeno, prijmeni").eq("id", brigadnikId).single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser?.id,
    typ: "prirazeni_zmena",
    popis: `${brigadnik?.prijmeni} ${brigadnik?.jmeno} přiřazen/a na akci "${akce.nazev}"`,
  })

  revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  revalidatePath(`/app/akce/${akceId}`)
  return { success: true }
}

export async function unassignBrigadnikFromAkce(akceId: string, brigadnikId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: akce } = await supabase
    .from("akce").select("nazev, nabidka_id").eq("id", akceId).single()

  const { error } = await supabase
    .from("prirazeni")
    .delete()
    .eq("akce_id", akceId)
    .eq("brigadnik_id", brigadnikId)

  if (error) return { error: error.message }

  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  const { data: brigadnik } = await supabase
    .from("brigadnici").select("jmeno, prijmeni").eq("id", brigadnikId).single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce?.nabidka_id,
    user_id: internalUser?.id,
    typ: "prirazeni_zmena",
    popis: `${brigadnik?.prijmeni} ${brigadnik?.jmeno} odebrán/a z akce "${akce?.nazev}"`,
  })

  revalidatePath(`/app/akce/${akceId}`)
  if (akce?.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

// ================================================================
// F-0012: briefing email (opt-in)
// ================================================================

export async function odeslatBriefing(akceId: string, briefingText?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, datum, misto, nabidka_id, prirazeni(brigadnik:brigadnici(id, email, jmeno, prijmeni), pozice, status)")
    .eq("id", akceId)
    .single()

  if (!akce) return { error: "Akce nenalezena" }

  const prirazeni = (akce.prirazeni ?? []) as unknown as Array<{
    brigadnik: { id: string; email: string; jmeno: string; prijmeni: string } | null
    pozice: string | null
    status: string
  }>

  const recipients = prirazeni.filter(p => p.status === "prirazeny" && p.brigadnik?.email)

  if (recipients.length === 0) {
    return { error: "Žádní přiřazení brigádníci s emailem" }
  }

  // Fetch template
  const { data: sablona } = await supabase
    .from("email_sablony")
    .select("predmet, obsah_html")
    .eq("nazev", "Briefing pro akci")
    .eq("aktivni", true)
    .single()

  if (!sablona) {
    return { error: "Šablona 'Briefing pro akci' nenalezena. Spusťte migraci." }
  }

  // Best-effort send via Gmail API
  let sent = 0
  const errors: string[] = []
  try {
    const { sendGmailMessage } = await import("@/lib/email/gmail-send")
    for (const r of recipients) {
      const b = r.brigadnik!
      const vars: Record<string, string> = {
        jmeno: b.jmeno,
        akce_nazev: akce.nazev,
        akce_datum: new Date(akce.datum).toLocaleDateString("cs-CZ"),
        akce_misto: akce.misto ?? "",
        pozice: r.pozice ?? "",
        briefing_text: briefingText ?? "",
      }
      const subject = sablona.predmet.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? "")
      const bodyHtml = sablona.obsah_html.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? "")
      try {
        await sendGmailMessage({ to: b.email, subject, bodyHtml })
        sent++
      } catch (err) {
        errors.push(`${b.email}: ${(err as Error).message}`)
      }
    }
  } catch {
    return { error: "Email klient není dostupný" }
  }

  // Audit
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  await supabase.from("historie").insert({
    akce_id: akceId,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser?.id,
    typ: "email_odeslan",
    popis: `Briefing odeslán (${sent}/${recipients.length} příjemců) — akce "${akce.nazev}"`,
    metadata: { sent, total: recipients.length, errors },
  })

  if (errors.length > 0) {
    return { success: true, warning: `Odesláno ${sent}/${recipients.length}. Chyby: ${errors.join("; ")}` }
  }
  return { success: true, sent }
}
