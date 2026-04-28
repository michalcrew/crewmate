"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sanitizeError } from "@/lib/utils/error-sanitizer"
import { resolveInternalUser } from "@/lib/utils/internal-user"

/**
 * F-0021e — GDPR čl. 17 (právo na výmaz) server actions.
 *
 * Model:
 *  1) Admin zaznamená žádost brigádníka → `recordErasureRequest(id)` nastaví
 *     `erasure_requested_at=NOW()`. Spouští 30denní lhůtu (čl. 12(3)).
 *     Schválení a anonymizace se provádí samostatným krokem.
 *  2) Admin provede anonymizaci → `anonymizeBrigadnik(id)`:
 *     - Pokud má brigádník DPP historii (smluvni_stav rows):
 *        • Smaže se kontakt (email, telefon, kor. adresa, zdrav. pojišťovna,
 *          foto_url, cv_url, osvc_ico, osvc_dic, osvc_fakturacni_adresa,
 *          bankovní účet, poznámky).
 *        • Zachová se core identity (jméno, příjmení, RČ, OP, datum narození,
 *          trvalá adresa) — právní povinnost (DPP retence 10 let).
 *        • `uchovat_do = MAX(rok FROM smluvni_stav) + 10 let`.
 *        • Update pipeline_entries.poznamky → NULL; hodnoceni_brigadnika.
 *          poznamka → NULL; email_threads.last_message_preview → NULL.
 *     - Pokud nemá DPP historii (nikdy nebyl obsazen):
 *        • Jméno → "Smazaný brigádník"
 *        • Příjmení → "#" + prvních 8 znaků UUID
 *        • Všechna ostatní pole (včetně RČ, OP) → NULL
 *        • `uchovat_do = NULL` (lze hard-delete kdykoliv).
 *
 * Audit: historie entry typ=`gdpr_erasure` (zachovaná — NEMAZAT ani po hard-delete).
 * existující entries zůstávají pro nepopiratelnost (kdo, kdy, co anonymizoval).
 *
 * RBAC: admin only (role check přes admin client fallback; pattern z MD-1).
 */

type AdminRoleCheck = { ok: true; userId: string } | { ok: false; error: string }

async function requireAdmin(): Promise<AdminRoleCheck> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Nepřihlášen" }

  const admin = createAdminClient()
  const me = await resolveInternalUser(user.id, user.email, admin)

  if (!me) return { ok: false, error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }
  if (me.role !== "admin") {
    return { ok: false, error: "Nemáte oprávnění (jen admin)" }
  }
  return { ok: true, userId: me.id }
}

/**
 * Zaznamenat přijetí GDPR žádosti. Neprovádí anonymizaci — jen startuje
 * 30denní lhůtu. Admin má 30 dní na provedení anonymizeBrigadnik().
 */
export async function recordErasureRequest(
  brigadnikId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }

  const admin = createAdminClient()

  // Idempotentní: pokud už je nastaveno, nepřepisovat.
  const { data: current } = await admin
    .from("brigadnici")
    .select("erasure_requested_at")
    .eq("id", brigadnikId)
    .single()

  if (current && (current as { erasure_requested_at: string | null }).erasure_requested_at) {
    return { success: true } // no-op
  }

  const { error } = await admin
    .from("brigadnici")
    .update({ erasure_requested_at: new Date().toISOString() })
    .eq("id", brigadnikId)

  if (error) return { error: sanitizeError(error, "recordErasureRequest") }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: auth.userId,
    typ: "gdpr_erasure",
    popis: "Zaznamenána GDPR žádost o výmaz (čl. 17). Startuje 30denní lhůta.",
    metadata: { phase: "request_recorded" },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

/**
 * Provést anonymizaci. Ověří zda má brigádník DPP historii a podle toho
 * vybere režim. NEMAZAT historii a audit log — retenční povinnost.
 */
export async function anonymizeBrigadnik(
  brigadnikId: string,
): Promise<{ success: true; mode: "dpp_preserved" | "full_pseudonym" } | { error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }

  const admin = createAdminClient()

  // Zjistit zda má DPP historii
  const { data: smluvni } = await admin
    .from("smluvni_stav")
    .select("rok")
    .eq("brigadnik_id", brigadnikId)
    .order("rok", { ascending: false })
    .limit(1)

  const maRokDPP = Array.isArray(smluvni) && smluvni.length > 0
  const posledniRok = maRokDPP ? (smluvni![0] as { rok: number }).rok : null

  let mode: "dpp_preserved" | "full_pseudonym"
  let update: Record<string, unknown>

  if (maRokDPP) {
    mode = "dpp_preserved"
    // Anonymize kontaktních / měkkých údajů. Core identity + trvalá adresa
    // zachována pro daňovou retenci (10 let od posledního roku DPP).
    update = {
      email: null,
      telefon: null,
      korespondencni_adresa: null,
      zdravotni_pojistovna: null,
      poznamky: null,
      foto_url: null,
      cv_url: null,
      cislo_uctu: null,
      kod_banky: null,
      osvc_ico: null,
      osvc_dic: null,
      osvc_fakturacni_adresa: null,
      anonymizovan_at: new Date().toISOString(),
      anonymizoval_user_id: auth.userId,
      uchovat_do: `${(posledniRok ?? new Date().getFullYear()) + 10}-12-31`,
    }
  } else {
    mode = "full_pseudonym"
    // Pseudonymizace — žádná DPP = žádná retenční povinnost.
    const idShort = brigadnikId.replace(/-/g, "").slice(0, 8)
    update = {
      jmeno: "Smazaný",
      prijmeni: `brigádník-${idShort}`,
      email: null,
      telefon: null,
      rodne_cislo: null,
      cislo_op: null,
      datum_narozeni: null,
      misto_narozeni: null,
      rodne_jmeno: null,
      rodne_prijmeni: null,
      ulice_cp: null,
      psc: null,
      mesto_bydliste: null,
      zeme: null,
      adresa: null,
      korespondencni_adresa: null,
      cislo_uctu: null,
      kod_banky: null,
      osvc_ico: null,
      osvc_dic: null,
      osvc_fakturacni_adresa: null,
      zdravotni_pojistovna: null,
      vzdelani: null,
      zdroj: null,
      poznamky: null,
      foto_url: null,
      cv_url: null,
      narodnost: null,
      anonymizovan_at: new Date().toISOString(),
      anonymizoval_user_id: auth.userId,
      uchovat_do: null,
    }
  }

  const { error } = await admin
    .from("brigadnici")
    .update(update)
    .eq("id", brigadnikId)

  if (error) return { error: sanitizeError(error, "anonymizeBrigadnik") }

  // Anonymize poznámky v souvisejících tabulkách (PII leak vector).
  await admin
    .from("pipeline_entries")
    .update({ poznamky: null })
    .eq("brigadnik_id", brigadnikId)

  await admin
    .from("hodnoceni_brigadnika")
    .update({ poznamka: null })
    .eq("brigadnik_id", brigadnikId)

  // Email thread preview — body zůstává (obsahuje komunikaci, audit), jen
  // last_message_preview clearneme, protože to je plainttext PII.
  await admin
    .from("email_threads")
    .update({ last_message_preview: "" })
    .eq("brigadnik_id", brigadnikId)

  // Audit: gdpr_erasure final entry (request byla zaznamenána v
  // recordErasureRequest, pokud se volalo — jinak toto je první entry).
  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: auth.userId,
    typ: "gdpr_erasure",
    popis:
      mode === "dpp_preserved"
        ? `GDPR anonymizace: kontaktní údaje smazány, core identity zachována (daňová retence do ${(posledniRok ?? 0) + 10}).`
        : "GDPR anonymizace: plná pseudonymizace (žádná DPP historie, lze hard-delete kdykoliv).",
    metadata: {
      phase: "anonymized",
      mode,
      last_dpp_year: posledniRok,
      anonymized_tables: ["brigadnici", "pipeline_entries", "hodnoceni_brigadnika", "email_threads"],
    },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  revalidatePath("/app/brigadnici")
  return { success: true, mode }
}
