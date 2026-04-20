import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_KEY not set")
  return Buffer.from(key, "hex")
}

export function encrypt(text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted format")
  const [ivHex, tagHex, ciphertext] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(ciphertext, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

// -----------------------------------------------------------------------------
// F-0013 Security override (D-17) — mixed encryption pro DIČ
// -----------------------------------------------------------------------------
//
// DIČ = daňové identifikační číslo. Fyzická osoba (FO) OSVČ používá formát
// `CZ` + 10 číslic, kde 10 číslic = její RČ (= osobní identifikátor, GDPR
// special category). Právnická osoba (PO) používá `CZ` + 8–9 číslic, což je
// její IČO — **veřejný** údaj dostupný v ARES.
//
// Security review F-0013 sekce 3 proto přebilo D-05/D-17 a rozhodlo:
//   - FO DIČ (CZ + 10 číslic) → šifrovat (leak = RČ)
//   - PO DIČ (CZ + 8-9 číslic) → plain (= veřejný IČO)
//
// Detekce běží čistě na délce číselné části. Neprovádí ARES lookup.
// -----------------------------------------------------------------------------

/** `CZ` + 10 číslic → FO DIČ (obsahuje RČ, musí být encrypted). */
const FO_DIC_REGEX = /^CZ\d{10}$/

/**
 * Podmíněně šifruje DIČ. Vrátí null pro null/empty, šifrovaný string pro FO
 * (CZ + 10 číslic), plain string pro PO (CZ + 8–9 číslic).
 *
 * Pozor: volající MUSÍ validovat formát přes Zod před zavoláním — tato funkce
 * `else` větev (plain text) vrací i pro nevalidní vstupy, bezpečná je jen
 * s pre-validated stringem.
 */
export function maybeEncryptDic(dic: string | null | undefined): string | null {
  if (!dic) return null
  const trimmed = dic.trim()
  if (trimmed.length === 0) return null
  if (FO_DIC_REGEX.test(trimmed)) {
    return encrypt(trimmed)
  }
  return trimmed
}

/**
 * Podmíněně dešifruje DIČ. Pro mixed-encryption flow: pokud je uložená
 * hodnota ve formátu AES-256-GCM ciphertextu (`iv:tag:ct`), dešifruje ji;
 * jinak (PO plain DIČ) vrátí originál.
 *
 * Defensive: pokud `decrypt` selže (např. rotated klíč, corrupted ciphertext,
 * historical plain-text CZ+10 data z pre-D-17 období), vrátí uloženou hodnotu
 * as-is, aby read path nikdy nekolapsoval. Error je propagován do volajícího
 * přes `console.warn` — v produkci by měl jít do Sentry.
 */
export function maybeDecryptDic(stored: string | null | undefined): string | null {
  if (!stored) return null
  // AES-256-GCM ciphertext has exactly 3 hex parts separated by `:`.
  // Plain `CZ12345678` has no `:` → returned as-is.
  const parts = stored.split(":")
  if (parts.length !== 3) return stored
  try {
    return decrypt(stored)
  } catch (err) {
    console.warn("maybeDecryptDic: decrypt failed, returning stored value", err)
    return stored
  }
}
