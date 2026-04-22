/**
 * MD-12 / SEC-019 — Error sanitization pro Server Actions.
 *
 * Problém: Raw PostgreSQL error messages (z Supabase) unikají do UI v
 * produkci a odhalují DB internals (constraint names, column names, table
 * structure). V audit sessionu byly identifikovány na 62 místech patternu
 * `return { error: error.message }`.
 *
 * Tento helper:
 *  - V dev (NODE_ENV !== "production") vrací full original message (pro DX).
 *  - V prod matchuje známé patterny a mapuje je na česká user-friendly
 *    hlášení. Pro neznámé chyby vrací generické hlášení + loguje do
 *    server console (Vercel logs) pro audit.
 *
 * Použití:
 *   import { sanitizeError } from "@/lib/utils/error-sanitizer"
 *   const { error } = await supabase.from("x").insert({...})
 *   if (error) return { error: sanitizeError(error, "createBrigadnik") }
 */

type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

type ErrorLike =
  | SupabaseLikeError
  | Error
  | { error: string }
  | string
  | null
  | undefined

const isProd = () => process.env.NODE_ENV === "production"

function extractMessage(err: ErrorLike): string {
  if (!err) return "Neznámá chyba"
  if (typeof err === "string") return err
  if ("message" in err && typeof err.message === "string") return err.message
  if ("error" in err && typeof err.error === "string") return err.error
  try {
    return JSON.stringify(err)
  } catch {
    return "Neznámá chyba"
  }
}

function extractCode(err: ErrorLike): string | undefined {
  if (!err || typeof err === "string") return undefined
  if ("code" in err && typeof err.code === "string") return err.code
  return undefined
}

/**
 * Mapování známých PostgreSQL / Supabase error patternů na user-friendly
 * česká hlášení. Preferuj PG error CODE před message match (stable).
 *
 * Reference:
 *  - https://www.postgresql.org/docs/current/errcodes-appendix.html
 *  - Supabase error codes: https://supabase.com/docs/guides/api/rest/error-codes
 */
function mapToUserMessage(
  rawMessage: string,
  code: string | undefined,
): string | null {
  // Unique violation
  if (code === "23505" || /duplicate key value/i.test(rawMessage)) {
    if (/email/i.test(rawMessage)) {
      return "Tento e-mail už v systému existuje."
    }
    if (/ico/i.test(rawMessage)) {
      return "Toto IČO už v systému existuje."
    }
    return "Záznam s těmito údaji už existuje."
  }
  // FK violation
  if (code === "23503" || /foreign key/i.test(rawMessage)) {
    return "Záznam je svázán s jiným záznamem a nelze jej upravit/smazat."
  }
  // NOT NULL violation
  if (code === "23502" || /null value in column/i.test(rawMessage)) {
    return "Chybí povinné pole. Zkontroluj formulář."
  }
  // CHECK violation
  if (code === "23514" || /check constraint/i.test(rawMessage)) {
    return "Zadané údaje nesplňují požadovaný formát."
  }
  // Auth errors (Supabase Auth)
  if (/invalid login credentials/i.test(rawMessage)) {
    return "Neplatný e-mail nebo heslo."
  }
  if (/email not confirmed/i.test(rawMessage)) {
    return "E-mail není potvrzený. Zkontroluj schránku."
  }
  if (/user already registered/i.test(rawMessage)) {
    return "Uživatel s tímto e-mailem už existuje."
  }
  // RLS denial
  if (code === "42501" || /permission denied/i.test(rawMessage) || /row-level/i.test(rawMessage)) {
    return "Nemáte oprávnění pro tuto operaci."
  }
  // Too large payload (file upload)
  if (/payload too large/i.test(rawMessage) || code === "PayloadTooLargeError") {
    return "Soubor je příliš velký."
  }
  // Rate limit
  if (/rate limit/i.test(rawMessage) || code === "429") {
    return "Příliš mnoho pokusů. Zkuste to za chvíli znovu."
  }
  // Network / timeout
  if (/timeout|timed out|ETIMEDOUT/i.test(rawMessage)) {
    return "Požadavek trval příliš dlouho. Zkuste to znovu."
  }
  return null
}

/**
 * Hlavní helper. `context` je nepovinný label pro server log (např. název
 * Server Action) — pomáhá dohledat chybu v Vercel logs podle requestu.
 *
 * V dev vrátí původní message (DX první). V prod:
 *  1. Zkusí namapovat přes mapToUserMessage.
 *  2. Pokud unknown → loguje + vrátí generic "Něco se nepovedlo, zkuste
 *     to znovu."
 */
export function sanitizeError(err: ErrorLike, context?: string): string {
  const rawMessage = extractMessage(err)
  const code = extractCode(err)

  if (!isProd()) {
    // Dev: full visibility pro DX. Context v prefixu pomáhá dev console.
    return context ? `[${context}] ${rawMessage}` : rawMessage
  }

  // Prod: namapuj známé patterny.
  const mapped = mapToUserMessage(rawMessage, code)
  if (mapped) return mapped

  // Unknown → server log + generic.
  console.error("[sanitizeError] unknown error", {
    context,
    code,
    message: rawMessage,
  })
  return "Něco se nepovedlo. Zkuste to znovu nebo kontaktujte podporu."
}
