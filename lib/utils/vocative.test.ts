/**
 * Standalone test pro getVocativeName.
 *
 * Spuštění: `npx tsx lib/utils/vocative.test.ts` (projekt nemá vitest/jest).
 * Exit 0 = OK, exit 1 = failure.
 */

import { getVocativeName } from "./vocative"

type Case = { input: string | null | undefined; expected: string; label: string }

const CASES: Case[] = [
  // Známá mužská jména
  { input: "Petr", expected: "Petře", label: "známé mužské (Petr)" },
  { input: "Jan", expected: "Jane", label: "známé mužské (Jan)" },
  { input: "Michal", expected: "Michale", label: "známé mužské (Michal)" },

  // Známá ženská jména
  { input: "Nikola", expected: "Nikolo", label: "známé ženské (Nikola)" },
  { input: "Jana", expected: "Jano", label: "známé ženské (Jana)" },
  { input: "Eva", expected: "Evo", label: "známé ženské (Eva)" },

  // Jména kde nominativ = vocativ
  { input: "Amálie", expected: "Amálie", label: "nominativ = vocativ (Amálie)" },
  { input: "Marie", expected: "Marie", label: "nominativ = vocativ (Marie)" },
  { input: "Jiří", expected: "Jiří", label: "nominativ = vocativ (Jiří)" },

  // Neznámá jména — fallback na trimnutý vstup
  { input: "Maicon", expected: "Maicon", label: "neznámé jméno (Maicon)" },
  { input: "Xyzabc", expected: "Xyzabc", label: "neznámé jméno (Xyzabc)" },

  // Různé casingy
  { input: "nikola", expected: "Nikolo", label: "lowercase vstup" },
  { input: "PETR", expected: "Petře", label: "uppercase vstup" },
  { input: "NiKoLa", expected: "Nikolo", label: "mixed case" },

  // Trim mezer
  { input: " Petr ", expected: "Petře", label: "mezery okolo" },
  { input: "  NIKOLA  ", expected: "Nikolo", label: "mezery + uppercase" },
  { input: "\tJana\n", expected: "Jano", label: "whitespace characters" },

  // Neznámé jméno se zachovanými mezerami → trim
  { input: "  Maicon  ", expected: "Maicon", label: "neznámé + trim" },

  // Prázdné / null / undefined
  { input: "", expected: "", label: "prázdný string" },
  { input: "   ", expected: "", label: "jen mezery" },
  { input: null, expected: "", label: "null" },
  { input: undefined, expected: "", label: "undefined" },
]

let passed = 0
let failed = 0

for (const c of CASES) {
  const actual = getVocativeName(c.input)
  if (actual === c.expected) {
    passed++
    console.log(`  ok    ${c.label}`)
  } else {
    failed++
    console.error(
      `  FAIL  ${c.label}: getVocativeName(${JSON.stringify(c.input)}) → ${JSON.stringify(actual)}, expected ${JSON.stringify(c.expected)}`
    )
  }
}

console.log(`\n${passed}/${CASES.length} passed${failed > 0 ? `, ${failed} FAILED` : ""}`)
if (failed > 0) process.exit(1)
