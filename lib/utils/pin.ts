import bcrypt from "bcryptjs"

/**
 * F-0021b — PIN hashing helper (bcrypt transition).
 *
 * Strategy (schema-only migrace + code PR):
 *   - `akce.pin_hash` NULL-able, přidán v F-0021b migraci.
 *   - `akce.pin_kod` plaintext, existuje (legacy).
 *   - Nové zápisy: dual-write — plaintext + bcrypt hash (pro kompatibilitu
 *     dokud není backfill dokončen).
 *   - Verifikace: preferuje pin_hash; fallback na plaintext pokud hash je NULL
 *     (= starý záznam před backfillem).
 *
 * Bcrypt cost factor 10 (balance latence/bezpečnost; ~50ms na modern CPU).
 *
 * Proč bcryptjs a ne nativní bcrypt:
 *   Vercel serverless neumí spolehlivě linkovat nativní addons (node-gyp).
 *   bcryptjs je pure JS, cca 2-3x pomalejší, ale pro ~5 verifikací denně
 *   per akce je to irelevantní a DX je výrazně lepší (žádný binary rebuild).
 */

const COST = 10

/**
 * Vytvoří bcrypt hash ze 6-místného PIN. Synchronní volání:
 *   - hashPin vrací Promise, ale interně používá bcryptjs async variantu
 *     pro non-blocking serverless.
 *   - Pokud potřebuješ sync (např. v middleware), použij bcrypt.hashSync.
 */
export async function hashPin(pin: string): Promise<string> {
  if (!pin || typeof pin !== "string") {
    throw new Error("PIN must be non-empty string")
  }
  return bcrypt.hash(pin, COST)
}

/**
 * Porovná zadaný PIN s uloženým hashem.
 * Timing-safe (bcrypt.compare je constant-time).
 */
export async function verifyPinHash(
  inputPin: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!inputPin || !storedHash) return false
  try {
    return await bcrypt.compare(inputPin, storedHash)
  } catch {
    return false
  }
}

/**
 * Hlavní verifikační helper pro transition period.
 *
 * Preferuje `pin_hash` (bcrypt); pokud je NULL, fallback na plaintext
 * `pin_kod` (legacy). Backfill script postupně převede všechny akce
 * na pin_hash — tehdy plaintext větev začne vždy returnovat false
 * (pro brand-new akce pin_kod nebude set).
 *
 * @returns true pokud PIN sedí (hash nebo plaintext)
 */
export async function verifyPin(
  inputPin: string | null | undefined,
  stored: { pin_hash: string | null; pin_kod: string | null },
): Promise<boolean> {
  if (!inputPin || typeof inputPin !== "string") return false

  if (stored.pin_hash) {
    return verifyPinHash(inputPin, stored.pin_hash)
  }

  // Legacy fallback — plaintext compare. Stále timing-unsafe, ale toto
  // je přechodná cesta dokud nebude backfill hotový.
  if (stored.pin_kod) {
    return inputPin === stored.pin_kod
  }

  return false
}

/**
 * Generuje 6-místný numerický PIN + jeho bcrypt hash (dual-write).
 *
 * Používá crypto.randomInt pro CSPRNG (bezpečné).
 * Return: { plaintext, hash } — volající zapíše OBOJI do DB
 * (pin_kod + pin_hash), dokud není backfill kompletní.
 * Po dokončení transitionu přepneme na { hash } only + migrace DROP pin_kod.
 */
export async function generatePinPair(): Promise<{ plaintext: string; hash: string }> {
  const { randomInt } = await import("node:crypto")
  const plaintext = randomInt(0, 1_000_000).toString().padStart(6, "0")
  const hash = await hashPin(plaintext)
  return { plaintext, hash }
}
