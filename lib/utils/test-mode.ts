/**
 * F-0023 — Test mode flag.
 *
 * Aktivováno přes Vercel env var `NEXT_PUBLIC_TEST_MODE=true`.
 * Když je on:
 * - Veřejný dotazník (/formular/[token]) zobrazí informaci místo formuláře
 *   — sbírá citlivá data (RČ, OP, banka, ZP), nesmí běžet v testu.
 * - DPP generování / odesílání je v UI skryté (root cause 503 nedořešen).
 * - Server actions, které sbírají citlivá data, vrací error.
 *
 * Pro spuštění reálné produkce: nastavit flag na "false" / odstranit z env.
 *
 * Helper čte env var stejně na serveru i clientu (NEXT_PUBLIC_ prefix
 * znamená inline at build time — vrací stejnou hodnotu všude).
 */
export function isTestMode(): boolean {
  const v = process.env.NEXT_PUBLIC_TEST_MODE
  return v === "true" || v === "1"
}
