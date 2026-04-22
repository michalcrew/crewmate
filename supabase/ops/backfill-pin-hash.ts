/**
 * F-0021b — Backfill skript: spočítat bcrypt hash pro existující
 * akce.pin_kod a zapsat do akce.pin_hash (WHERE pin_hash IS NULL).
 *
 * Spuštění (lokálně, ne v CI):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/ops/backfill-pin-hash.ts
 *
 * Bezpečnostní poznámky:
 *  - Vyžaduje SERVICE_ROLE_KEY. NIKDY necommituj do repozitáře.
 *  - Běží jednou; idempotentní (skipuje akce, které už mají pin_hash).
 *  - Po dokončení lze v dalším PR přepnout verifyPin() jen na pin_hash
 *    a eventuálně DROP pin_kod v nové migraci (post-MVP technical debt).
 *
 * Proč samostatný skript a ne migrace:
 *  - bcrypt.hash potřebuje Node.js runtime, Supabase SQL editor to
 *    nedokáže. Muselo by to přes pgcrypto s crypt(password, gen_salt('bf')),
 *    ale konzistence formátu s bcryptjs hashem v aplikaci není 100%
 *    zaručená. Bezpečnější je čistý Node skript.
 */

import { createClient } from "@supabase/supabase-js"
import bcrypt from "bcryptjs"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const COST = 10
const supabase = createClient(URL, KEY)

async function main() {
  console.log("[backfill] Fetching akce without pin_hash...")
  const { data, error } = await supabase
    .from("akce")
    .select("id, nazev, pin_kod, pin_hash")
    .is("pin_hash", null)
    .not("pin_kod", "is", null)

  if (error) {
    console.error("[backfill] Query failed:", error.message)
    process.exit(1)
  }

  const rows = data ?? []
  console.log(`[backfill] Found ${rows.length} akce to process`)

  let ok = 0
  let skip = 0
  let fail = 0

  for (const row of rows) {
    const pin = (row as { pin_kod: string | null }).pin_kod
    if (!pin) {
      skip++
      continue
    }
    try {
      const hash = await bcrypt.hash(pin, COST)
      const { error: upErr } = await supabase
        .from("akce")
        .update({ pin_hash: hash })
        .eq("id", row.id)
        .is("pin_hash", null) // idempotent guard — race-safe

      if (upErr) {
        console.error(`[backfill] FAIL ${row.id} (${row.nazev}): ${upErr.message}`)
        fail++
      } else {
        ok++
        if (ok % 10 === 0) console.log(`[backfill] ...${ok} done`)
      }
    } catch (e) {
      console.error(`[backfill] HASH FAIL ${row.id}: ${String(e)}`)
      fail++
    }
  }

  console.log(`[backfill] DONE — ok=${ok}, skip=${skip}, fail=${fail}`)
  console.log(`[backfill] Next step: ověř 'SELECT COUNT(*) FROM akce WHERE pin_hash IS NULL' = 0`)
}

main().catch((e) => {
  console.error("[backfill] UNCAUGHT:", e)
  process.exit(1)
})
