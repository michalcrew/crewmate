import { z } from "zod"

/**
 * F-0016 Zod schemata pro hodnocení + pipeline poznámky + brigádníci filter.
 *
 * D-F0016-01: akce_id je volitelné (hodnocení i bez vazby na akci).
 * D-F0016-04 (C): žádný autor/admin guard — validace zde jen payload.
 * Poznámka: max 500 znaků (UI/Zod-level, ne DB CHECK).
 */

export const addHodnoceniSchema = z.object({
  brigadnik_id: z.string().uuid("Neplatné ID brigádníka"),
  hodnoceni: z.number().int().min(1, "Hodnocení 1-5").max(5, "Hodnocení 1-5"),
  poznamka: z.string().max(500, "Max 500 znaků").optional().nullable(),
  akce_id: z.string().uuid("Neplatné ID akce").optional().nullable(),
})

export const updateHodnoceniSchema = z.object({
  hodnoceni: z.number().int().min(1).max(5).optional(),
  poznamka: z.string().max(500, "Max 500 znaků").nullable().optional(),
  akce_id: z.string().uuid("Neplatné ID akce").nullable().optional(),
})

export const updatePipelinePoznamkaSchema = z.object({
  entry_id: z.string().uuid("Neplatné ID pipeline entry"),
  text: z.string().max(500, "Max 500 znaků"),
})

export const brigadniciFilterSchema = z.object({
  search: z.string().optional(),
  typ: z.enum(["all", "brigadnik", "osvc"]).default("all").optional(),
  status: z
    .array(
      z.enum([
        "nevyplnene_udaje",
        "vyplnene_udaje",
        "poslana_dpp",
        "podepsana_dpp",
        "ukoncena_dpp",
        "osvc",
      ])
    )
    .optional(),
})

export type AddHodnoceniInput = z.infer<typeof addHodnoceniSchema>
export type UpdateHodnoceniInput = z.infer<typeof updateHodnoceniSchema>
export type UpdatePipelinePoznamkaInput = z.infer<typeof updatePipelinePoznamkaSchema>
export type BrigadniciFilter = z.infer<typeof brigadniciFilterSchema>

/**
 * Dokumentační status ranking (z F-0013 v_brigadnik_zakazka_status).
 * Pro globální status brigádníka = MAX rank přes všechny pipeline entries.
 */
export const DOKUMENTACNI_STAV_RANK: Record<string, number> = {
  osvc: 5,
  ukoncena_dpp: 4,
  podepsana_dpp: 3,
  poslana_dpp: 2,
  vyplnene_udaje: 1,
  nevyplnene_udaje: 0,
}

export const RANK_TO_DOKUMENTACNI_STAV: Record<number, string> = {
  5: "osvc",
  4: "ukoncena_dpp",
  3: "podepsana_dpp",
  2: "poslana_dpp",
  1: "vyplnene_udaje",
  0: "nevyplnene_udaje",
}
