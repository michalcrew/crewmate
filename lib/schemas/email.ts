import { z } from "zod"

export const sendEmailSchema = z.object({
  brigadnik_id: z.string().uuid(),
  subject: z.string().min(1, "Předmět je povinný").max(500),
  body_html: z.string().min(1, "Text emailu je povinný").max(100000),
  attachment_ids: z.array(z.string().uuid()).optional(),
  document_type: z.enum(["dpp", "prohlaseni", "briefing", "plain"]).optional(),
})

export const sendDocumentSchema = z.object({
  brigadnik_id: z.string().uuid(),
  document_type: z.enum(["dpp", "prohlaseni"]),
  mesic: z.string().regex(/^\d{4}-\d{2}-01$/, "Měsíc musí být ve formátu YYYY-MM-01"),
  body_html: z.string().min(1, "Text emailu je povinný").max(100000),
})

export const classifyAttachmentSchema = z
  .object({
    attachment_id: z.string().uuid(),
    classified_as: z.enum([
      "dpp", "dpp_podpis",
      "prohlaseni", "prohlaseni_podpis",
      "briefing", "jiny",
    ]),
    mesic: z.string().regex(/^\d{4}-\d{2}-01$/).optional(),
  })
  .refine(
    (data) => {
      if (["dpp_podpis", "prohlaseni_podpis"].includes(data.classified_as)) {
        return !!data.mesic
      }
      return true
    },
    { message: "Měsíc je povinný pro klasifikaci DPP/prohlášení podpisu" }
  )

export const updateConversationSchema = z.object({
  thread_id: z.string().uuid(),
  status: z.enum(["nove", "ceka_na_brigadnika", "ceka_na_nas", "vyreseno"]),
})

export const threadListSchema = z.object({
  status_filter: z
    .enum(["nove", "ceka_na_brigadnika", "ceka_na_nas", "vyreseno"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
