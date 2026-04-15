/**
 * CV Work Experience Extraction via Gemini API
 * Extracts structured work experience data from CV text
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

type ExtractedExperience = {
  pozice: string
  popis: string
  datum_od: string | null // YYYY-MM-DD
  datum_do: string | null
}

export async function extractWorkExperienceFromText(
  cvText: string
): Promise<ExtractedExperience[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set — skipping CV AI extraction")
    return []
  }

  if (!cvText || cvText.trim().length < 50) {
    return []
  }

  // Truncate to avoid token limits
  const truncated = cvText.slice(0, 8000)

  const prompt = `Analyzuj následující text z životopisu (CV) a extrahuj pracovní zkušenosti.

Pro každou zkušenost vrať:
- pozice: název pozice (česky pokud je to v češtině)
- popis: stručný popis práce (1-2 věty)
- datum_od: datum začátku ve formátu YYYY-MM-DD (pokud je uvedeno, jinak null)
- datum_do: datum konce ve formátu YYYY-MM-DD (pokud je uvedeno, jinak null)

Vrať POUZE platný JSON array. Žádný markdown, žádný text navíc.

Příklad výstupu:
[{"pozice":"Barman","popis":"Příprava koktejlů a obsluha baru na večerních akcích","datum_od":"2024-06-01","datum_do":"2024-09-30"}]

Text z CV:
${truncated}`

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        },
      }),
    })

    if (!response.ok) {
      console.error("Gemini API error:", response.status)
      return []
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as unknown[]

    // Validate and filter
    return parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && "pozice" in item
      )
      .map((item) => ({
        pozice: String(item.pozice ?? ""),
        popis: String(item.popis ?? ""),
        datum_od: typeof item.datum_od === "string" ? item.datum_od : null,
        datum_do: typeof item.datum_do === "string" ? item.datum_do : null,
      }))
      .filter((item) => item.pozice.length > 0)
  } catch (error) {
    console.error("CV extraction error:", error)
    return []
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid SSR issues
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (pdfParseModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default ?? pdfParseModule
    const result = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer)
    return result.text ?? ""
  } catch (error) {
    console.error("PDF parse error:", error)
    return ""
  }
}
