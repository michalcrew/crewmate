export const APP_NAME = "Crewmate"
export const APP_DESCRIPTION = "Systém pro správu brigádníků a eventového personálu"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/app", icon: "LayoutDashboard" },
  { label: "Nabídky", href: "/app/nabidky", icon: "Briefcase" },
  { label: "Brigádníci", href: "/app/brigadnici", icon: "Users" },
  { label: "Akce", href: "/app/akce", icon: "Calendar" },
  { label: "Měsíční přehled", href: "/app/prehled-mesic", icon: "BarChart3" },
  { label: "Šablony", href: "/app/sablony", icon: "FileText" },
  { label: "Nastavení", href: "/app/nastaveni", icon: "Settings" },
] as const

export const PIPELINE_STATES = {
  zajemce: { label: "Zájemce", color: "bg-blue-500/10 text-blue-500" },
  kontaktovan: { label: "Kontaktován", color: "bg-yellow-500/10 text-yellow-500" },
  prijaty_nehotova_admin: { label: "Přijatý — nehotová admin", color: "bg-orange-500/10 text-orange-500" },
  prijaty_vse_vyreseno: { label: "Přijatý — vše vyřešeno", color: "bg-green-500/10 text-green-500" },
  odmitnuty: { label: "Odmítnutý", color: "bg-red-500/10 text-red-500" },
} as const

export const DPP_STATES = {
  zadny: { label: "—", color: "text-muted-foreground" },
  vygenerovano: { label: "Vygenerováno", color: "text-yellow-500" },
  odeslano: { label: "Odesláno", color: "text-orange-500" },
  podepsano: { label: "Podepsáno", color: "text-green-500" },
} as const

export const ZDRAVOTNI_POJISTOVNY = [
  { kod: "111", nazev: "VZP ČR" },
  { kod: "201", nazev: "VoZP" },
  { kod: "205", nazev: "ČPZP" },
  { kod: "207", nazev: "OZP" },
  { kod: "209", nazev: "ZPŠ" },
  { kod: "211", nazev: "ZPMV" },
  { kod: "213", nazev: "RBP" },
] as const

export const VZDELANI_OPTIONS = [
  { value: "zakladni", label: "Základní" },
  { value: "stredni_bez", label: "Střední bez maturity" },
  { value: "stredni_s", label: "Střední s maturitou" },
  { value: "vyssi_odborne", label: "Vyšší odborné" },
  { value: "vysokoskolske", label: "Vysokoškolské" },
] as const

export const TYP_POZICE_OPTIONS = [
  "barman", "vstupar", "satnar", "hostesa",
  "bezpecnost", "uklid", "produkce", "koordinator",
] as const
