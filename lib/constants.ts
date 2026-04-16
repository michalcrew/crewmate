export const APP_NAME = "Crewmate"
export const APP_DESCRIPTION = "Systém pro správu brigádníků a eventového personálu"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export const NAV_SECTIONS = [
  {
    label: "Hlavní",
    items: [
      { label: "Dashboard", href: "/app", icon: "LayoutDashboard" },
      { label: "Zakázky", href: "/app/nabidky", icon: "Briefcase" },
      { label: "Brigádníci", href: "/app/brigadnici", icon: "Users" },
      { label: "Emaily", href: "/app/emaily", icon: "Mail" },
      { label: "Akce", href: "/app/akce", icon: "Calendar" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Měsíční přehled", href: "/app/prehled-mesic", icon: "BarChart3" },
      { label: "Moje hodiny", href: "/app/hodiny", icon: "Clock" },
    ],
  },
  {
    label: "Správa",
    items: [
      { label: "Šablony", href: "/app/sablony", icon: "FileText" },
      { label: "Nastavení", href: "/app/nastaveni", icon: "Settings" },
    ],
  },
] as const

export const NAV_ITEMS = NAV_SECTIONS.flatMap(s => [...s.items])

export const PIPELINE_STATES = {
  zajemce: { label: "Zájemce", color: "bg-blue-500/10 text-blue-500" },
  kontaktovan: { label: "Kontaktován", color: "bg-yellow-500/10 text-yellow-500" },
  prijaty_nehotova_admin: { label: "Přijatý — nehotová admin", color: "bg-orange-500/10 text-orange-500" },
  prijaty_vse_vyreseno: { label: "Přijatý — vše vyřešeno", color: "bg-green-500/10 text-green-500" },
  odmitnuty: { label: "Odmítnutý", color: "bg-red-500/10 text-red-500" },
} as const

export const NABIDKA_TYPY = {
  aktivni: { label: "Aktivní", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", desc: "Jednorázová akce" },
  stala: { label: "Stálá", color: "bg-green-500/10 text-green-500 border-green-500/20", desc: "Průběžný nábor" },
} as const

export const DPP_STATES = {
  zadny: { label: "—", color: "text-muted-foreground" },
  vygenerovano: { label: "Vygenerováno", color: "text-yellow-500" },
  odeslano: { label: "Odesláno", color: "text-orange-500" },
  podepsano: { label: "Podepsáno", color: "text-green-500" },
} as const

export const ZDRAVOTNI_POJISTOVNY = [
  { kod: "111", nazev: "VZP — Všeobecná zdravotní pojišťovna" },
  { kod: "201", nazev: "VOZP — Vojenská zdravotní pojišťovna ČR" },
  { kod: "205", nazev: "ČPZP — Česká průmyslová zdravotní pojišťovna" },
  { kod: "207", nazev: "OZP — Oborová zdravotní pojišťovna" },
  { kod: "209", nazev: "ZP Škoda — Zaměstnanecká pojišťovna Škoda" },
  { kod: "211", nazev: "ZPMV — ZP ministerstva vnitra ČR" },
  { kod: "213", nazev: "RBP — Revírní bratrská pokladna" },
  { kod: "jina", nazev: "Jiná (vyplňte níže)" },
] as const

export const VZDELANI_OPTIONS = [
  { value: "A", label: "A — Bez vzdělání" },
  { value: "B", label: "B — Neúplné základní vzdělání" },
  { value: "C", label: "C — Základní vzdělání" },
  { value: "D", label: "D — Nižší střední vzdělání" },
  { value: "E", label: "E — Nižší střední odborné vzdělání" },
  { value: "H", label: "H — Střední odborné s výučním listem" },
  { value: "J", label: "J — Střední bez maturity i výučního listu" },
  { value: "K", label: "K — Úplné střední všeobecné (gymnázium)" },
  { value: "L", label: "L — Úplné střední odborné s vyučením i maturitou" },
  { value: "M", label: "M — Úplné střední odborné s maturitou (bez vyučení)" },
  { value: "N", label: "N — Vyšší odborné vzdělání" },
  { value: "P", label: "P — Vyšší odborné v konzervatoři" },
  { value: "R", label: "R — Bakalářské vzdělání" },
  { value: "T", label: "T — Magisterské vzdělání" },
  { value: "V", label: "V — Doktorské vzdělání" },
  { value: "nevim", label: "Nevím" },
] as const

export const TYP_POZICE_OPTIONS = [
  "barman", "vstupar", "satnar", "hostesa",
  "bezpecnost", "uklid", "produkce", "koordinator",
] as const
