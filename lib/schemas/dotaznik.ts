import { z } from "zod"

/**
 * F-0013 — Dotazník schema (discriminated union "brigadnik" | "osvc").
 *
 * Strategie:
 *  - Common fields (jmeno, prijmeni, email, telefon, gdpr) ve všech variantách.
 *  - Brigadnik branch: plné DPP-required údaje (RČ, OP, banka, pojišťovna, ...).
 *  - OSVC branch:      fakturační údaje (IČO povinné, DIČ volitelné, adresa).
 *
 * D-F0013-14: Server Action doplní `typ_brigadnika` default `brigadnik`
 *             před parse, protože unchecked checkbox FormData nepošle.
 */

const commonFields = {
  token: z.string().min(1, "Token je povinný"),
  jmeno: z.string().min(1, "Jméno je povinné").max(100),
  prijmeni: z.string().min(1, "Příjmení je povinné").max(100),
  telefon: z.string().min(9, "Telefon je povinný").max(20),
  gdpr: z.literal("on", { message: "Souhlas je povinný" }),
}

export const brigadnikBranchSchema = z.object({
  typ_brigadnika: z.literal("brigadnik"),
  ...commonFields,

  // DPP povinné
  datum_narozeni: z.string().min(1, "Datum narození je povinné"),
  rodne_cislo: z
    .string()
    .regex(/^\d{6}\/\d{3,4}$/, "Rodné číslo ve formátu 123456/7890"),
  rodne_jmeno: z.string().max(100).optional(),
  rodne_prijmeni: z.string().max(100).optional(),
  misto_narozeni: z.string().min(1, "Místo narození je povinné").max(200),

  // Adresa
  ulice_cp: z.string().min(1, "Ulice a č.p. je povinné").max(200),
  psc: z.string().regex(/^\d{3}\s?\d{2}$/, "PSČ ve formátu 110 00"),
  mesto_bydliste: z.string().min(1, "Město je povinné").max(100),
  zeme: z.string().min(1, "Země je povinná").max(100),
  korespondencni_adresa: z.string().max(500).optional(),

  // Identifikace
  cislo_op: z.string().min(6, "Číslo OP je povinné").max(20),

  // Banka
  cislo_uctu: z.string().min(1, "Číslo účtu je povinné"),
  kod_banky: z.string().regex(/^\d{4}$/, "Kód banky je 4 číslice"),

  // ZP + vzdělání
  zdravotni_pojistovna: z.string().min(1, "Zdravotní pojišťovna je povinná"),
  zdravotni_pojistovna_jina: z.string().optional(),
  vzdelani: z.string().min(1, "Vzdělání je povinné"),

  // F-0013: nová pole
  narodnost: z.string().min(1, "Národnost je povinná").max(100),
  chce_ruzove_prohlaseni: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional(),
})

export const osvcBranchSchema = z.object({
  typ_brigadnika: z.literal("osvc"),
  ...commonFields,

  email: z.string().email("Neplatný email").optional(), // z přihlášky, UI may omit

  // OSVČ povinná pole
  osvc_ico: z
    .string()
    .regex(/^\d{7,12}$/, "IČO 7–12 číslic (CZ i zahraniční)"),
  // D-17 (security override): CZ + 8–10 číslic.
  //  - CZ + 10 číslic = FO (číselná část = RČ → encrypted na app layer)
  //  - CZ + 8–9 číslic = PO (číselná část = IČO → plain, veřejný přes ARES)
  // Detekci FO/PO a podmíněné šifrování řeší `maybeEncryptDic()`.
  osvc_dic: z
    .string()
    .regex(/^CZ\d{8,10}$/, "DIČ ve formátu CZ + 8–10 číslic")
    .optional()
    .or(z.literal("")),
  osvc_fakturacni_adresa: z
    .string()
    .min(5, "Fakturační adresa je povinná")
    .max(500),
})

export const dotaznikSchema = z.discriminatedUnion("typ_brigadnika", [
  brigadnikBranchSchema,
  osvcBranchSchema,
])

export type DotaznikInput = z.infer<typeof dotaznikSchema>
export type BrigadnikBranchInput = z.infer<typeof brigadnikBranchSchema>
export type OsvcBranchInput = z.infer<typeof osvcBranchSchema>

// -----------------------------------------------------------
// Sub-schemas pro Server Actions pracující se samostatnými poli
// -----------------------------------------------------------

export const updateBrigadnikTypSchema = z.object({
  brigadnik_id: z.string().uuid(),
  typ: z.enum(["brigadnik", "osvc"]),
})

export const updateBrigadnikOsvcFieldsSchema = z.object({
  brigadnik_id: z.string().uuid(),
  osvc_ico: z.string().regex(/^\d{7,12}$/).optional(),
  // D-17: CZ + 8–10 číslic. Mixed encryption (FO encrypted, PO plain) řeší
  // `maybeEncryptDic()` v Server Action, ne Zod layer.
  osvc_dic: z
    .string()
    .regex(/^CZ\d{8,10}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  osvc_fakturacni_adresa: z.string().min(5).max(500).optional(),
})

export const signDppInputSchema = z.object({
  brigadnik_id: z.string().uuid(),
  rok: z.number().int().min(2020).max(2100),
  dokument_id: z.string().uuid().optional(),
})

export const ukoncitDppInputSchema = z.object({
  brigadnik_id: z.string().uuid(),
  rok: z.number().int().min(2020).max(2100),
  duvod: z.string().max(500).optional(),
})

export const updateUserPodpisSchema = z.object({
  podpis: z.string().max(1000, "Podpis max. 1000 znaků"),
  // HF4: volitelný bool — pokud true, email pipeline prepend Crewmate logo.
  pridat_logo: z.boolean().optional().default(false),
})

/**
 * F-0013 D-F0013-04 — 20 nejčastějších národností + "Jiná".
 * UI z ní pro select; server ji používá pouze jako reference (text free).
 */
export const NARODNOSTI = [
  "Česká",
  "Slovenská",
  "Ukrajinská",
  "Polská",
  "Vietnamská",
  "Mongolská",
  "Rumunská",
  "Bulharská",
  "Ruská",
  "Maďarská",
  "Německá",
  "Britská",
  "Americká",
  "Běloruská",
  "Moldavská",
  "Srbská",
  "Chorvatská",
  "Slovinská",
  "Italská",
  "Rakouská",
  "Jiná",
] as const
