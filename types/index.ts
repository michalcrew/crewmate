export type UserRole = "admin" | "naborar"

export type PipelineState =
  | "zajemce"
  | "kontaktovan"
  | "prijaty_nehotova_admin"
  | "prijaty_vse_vyreseno"
  | "odmitnuty"

export type NabidkaTyp = "jednorazova" | "prubezna"
export type NabidkaStav = "aktivni" | "pozastavena" | "ukoncena"

export type AkceStav = "planovana" | "probehla" | "zrusena"
export type PrirazeniStatus = "prirazeny" | "nahradnik" | "vypadl"

export type DppStav = "zadny" | "vygenerovano" | "odeslano" | "podepsano"
export type ProhlaseniStav = DppStav

export type DokumentTyp =
  | "dpp" | "dpp_podpis"
  | "prohlaseni" | "prohlaseni_podpis"
  | "cv" | "foto" | "jiny"

export type Vzdelani =
  | "zakladni" | "stredni_bez" | "stredni_s"
  | "vyssi_odborne" | "vysokoskolske"
