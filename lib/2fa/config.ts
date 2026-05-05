// Feature flag pro emailové 2FA.
// Když je env `NEXT_PUBLIC_2FA_ENABLED` nastavené na "true",
// po úspěšném password loginu uživatel projde 2FA krokem
// (kód do mailu) — pokud nemá platnou cookie důvěryhodného zařízení.

export function is2FAEnabled(): boolean {
  return process.env.NEXT_PUBLIC_2FA_ENABLED === "true"
}

// Platnost kódu v emailu (od vygenerování).
export const TWO_FA_CODE_TTL_MIN = 10

// Délka platnosti důvěryhodného zařízení po zaškrtnutí checkboxu.
export const TWO_FA_TRUST_DAYS = 90

// Cookie name — sdílené mezi setem a middleware kontrolou.
export const TWO_FA_TRUST_COOKIE = "2fa_trust"
export const TWO_FA_SESSION_COOKIE = "2fa_session"
