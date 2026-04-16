/**
 * Validate brigadník has all required fields for DPP generation.
 * Returns { valid, missing } where missing is an array of Czech field labels.
 */
export function validateDPPFields(brigadnik: Record<string, unknown>): {
  valid: boolean
  missing: string[]
} {
  const required: [string, string][] = [
    ["jmeno", "Jméno"],
    ["prijmeni", "Příjmení"],
    ["telefon", "Telefon"],
    ["datum_narozeni", "Datum narození"],
    ["email", "Email"],
    ["ulice_cp", "Trvalé bydliště — ulice a č.p."],
    ["psc", "Trvalé bydliště — PSČ"],
    ["mesto_bydliste", "Trvalé bydliště — město"],
    ["zeme", "Země trvalého bydliště"],
    ["cislo_uctu", "Číslo bankovního účtu"],
    ["kod_banky", "Kód banky"],
    ["cislo_op", "Číslo OP"],
    ["misto_narozeni", "Místo narození"],
    ["rodne_cislo", "Rodné číslo"],
    ["zdravotni_pojistovna", "Zdravotní pojišťovna"],
    ["vzdelani", "Nejvyšší dokončené vzdělání"],
  ]

  const missing: string[] = []

  for (const [field, label] of required) {
    const value = brigadnik[field]
    if (value === null || value === undefined || value === "") {
      missing.push(label)
    }
  }

  return { valid: missing.length === 0, missing }
}

export function validateProhlaseniFields(brigadnik: Record<string, unknown>): {
  valid: boolean
  missing: string[]
} {
  const required: [string, string][] = [
    ["jmeno", "Jméno"],
    ["prijmeni", "Příjmení"],
    ["ulice_cp", "Trvalé bydliště — ulice a č.p."],
    ["psc", "PSČ"],
    ["mesto_bydliste", "Město"],
  ]

  const missing: string[] = []

  for (const [field, label] of required) {
    const value = brigadnik[field]
    if (value === null || value === undefined || value === "") {
      missing.push(label)
    }
  }

  return { valid: missing.length === 0, missing }
}
