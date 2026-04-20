import React from "react"
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Font } from "@react-pdf/renderer"

// ============================================================
// HF4 — Font s plnou podporou české diakritiky (Latin Extended-A)
// ============================================================
// Helvetica (built-in @react-pdf/renderer) nemá glyfy ř, ě, č, …
// → registrujeme Noto Sans z Google Fonts CDN (licenčně čistý, CE subset).
// Pokud CDN spadne v build / runtime, PDF se vygeneruje s fallbackem
// (glyf missing = prázdný prostor), ale text zůstane validní.
Font.register({
  family: "NotoSans",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notosans/v39/o-0IIpQlx3QUlC5A4PNb4j5Ba_2c7A.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notosans/v39/o-0NIpQlx3QUlC5A4PNjXhFVadyBx2pqPIif.ttf",
      fontWeight: "bold",
    },
  ],
})

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "NotoSans", lineHeight: 1.45 },
  title: { fontSize: 14, textAlign: "center", marginBottom: 4, fontWeight: "bold" },
  subtitle: { fontSize: 9, textAlign: "center", color: "#444", marginBottom: 16 },
  partyBlock: { marginBottom: 10 },
  partyHeader: { fontSize: 10, fontWeight: "bold", marginBottom: 4 },
  partyLine: { marginBottom: 2 },
  partyNote: { fontSize: 9, color: "#555", marginTop: 2, fontStyle: "italic" },
  row: { flexDirection: "row", borderWidth: 1, borderColor: "#ccc", borderTopWidth: 0 },
  rowFirst: { flexDirection: "row", borderWidth: 1, borderColor: "#ccc" },
  cellLabel: {
    width: "40%",
    padding: 4,
    backgroundColor: "#f5f5f5",
    borderRightWidth: 1,
    borderRightColor: "#ccc",
    fontSize: 9,
  },
  cellValue: { width: "60%", padding: 4, fontSize: 9 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: { marginBottom: 6, textAlign: "justify" },
  bullet: { marginLeft: 10, marginBottom: 2 },
  signatureRow: {
    flexDirection: "row",
    marginTop: 40,
    justifyContent: "space-between",
  },
  signatureBox: {
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: "#000",
    paddingTop: 6,
    textAlign: "center",
    fontSize: 9,
  },
  date: { marginTop: 30, marginBottom: 20, fontSize: 10 },
})

export type DppData = {
  jmeno: string
  prijmeni: string
  rodne_cislo: string
  rodne_jmeno: string | null
  rodne_prijmeni: string | null
  trvale_bydliste: string
  korespondencni_adresa: string | null
  datum_narozeni: string
  misto_narozeni: string | null
  cislo_uctu: string
  kod_banky: string
  email: string
  telefon: string
  zdravotni_pojistovna: string
  cislo_op: string
  vzdelani: string | null
  rok: number
  datum_podpisu: string
}

function val(s: string | null | undefined): string {
  const t = (s ?? "").trim()
  return t.length > 0 ? t : "—"
}

function DppDocument({ data }: { data: DppData }) {
  const employeeRows: Array<[string, string]> = [
    ["Jméno", val(data.jmeno)],
    ["Příjmení", val(data.prijmeni)],
    ["Rodné číslo", val(data.rodne_cislo)],
    ["Rodné jméno (pokud je jiné)", val(data.rodne_jmeno)],
    ["Rodné příjmení (pokud je jiné)", val(data.rodne_prijmeni)],
    ["Trvalé bydliště", val(data.trvale_bydliste)],
    ["Korespondenční adresa", val(data.korespondencni_adresa)],
    ["Datum narození", val(data.datum_narozeni)],
    ["Místo narození", val(data.misto_narozeni)],
    ["Číslo účtu pro zasílání mzdy", val(data.cislo_uctu)],
    ["Kód banky", val(data.kod_banky)],
    ["E-mail", val(data.email)],
    ["Telefon", val(data.telefon)],
    ["Zdravotní pojišťovna", val(data.zdravotni_pojistovna)],
    ["Číslo OP nebo jiného dokladu", val(data.cislo_op)],
    ["Nejvyšší dosažené vzdělání", val(data.vzdelani)],
  ]

  return (
    <Document>
      {/* -------- PAGE 1 — hlavička + smluvní strany -------- */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>DOHODA O PROVEDENÍ PRÁCE</Text>
        <Text style={styles.subtitle}>
          uzavřená dle ustanovení § 75 zákona č. 262/2006 Sb., zákoníku práce, ve
          znění pozdějších předpisů
        </Text>

        <Text style={{ marginBottom: 8 }}>mezi:</Text>

        <View style={styles.partyBlock}>
          <Text style={styles.partyHeader}>Crewmate s.r.o.</Text>
          <Text style={styles.partyLine}>
            Sídlo: Revoluční 1403/28, Praha - Nové Město, 11000
          </Text>
          <Text style={styles.partyLine}>IČ: 23782587</Text>
          <Text style={styles.partyLine}>
            Společnost je zapsána v obchodním rejstříku vedeném Městským soudem
            v Praze, oddíl C, vložka 432834.
          </Text>
          <Text style={styles.partyLine}>
            zastoupená: Michalem Hrachovickým, jednatelem
          </Text>
          <Text style={styles.partyNote}>(dále jen „Zaměstnavatel")</Text>
        </View>

        <Text style={{ marginBottom: 6 }}>a</Text>

        <View style={styles.partyBlock}>
          <Text style={styles.partyHeader}>Zaměstnanec:</Text>
          {employeeRows.map(([label, value], idx) => (
            <View style={idx === 0 ? styles.rowFirst : styles.row} key={label}>
              <Text style={styles.cellLabel}>{label}</Text>
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          ))}
          <Text style={styles.partyNote}>(dále jen „Zaměstnanec")</Text>
        </View>
      </Page>

      {/* -------- PAGE 2+ — paragrafy I.-X. -------- */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>I. Předmět dohody</Text>
        <Text style={styles.paragraph}>
          Zaměstnanec se zavazuje vykonávat pro Zaměstnavatele práce dle jeho
          pokynů, zejména činnosti koordinátora, scanneru, navigátora,
          pokladníka, promotéra, technického asistenta, obsluhy nebo jiné
          organizační a podpůrné práce spojené s realizací kulturních,
          společenských a studentských akcí. Tyto práce budou vykonávány
          osobně, dle pokynů Zaměstnavatele, v určených termínech, časech a na
          místech stanovených Zaměstnavatelem. Práce budou prováděny podle
          potřeb Zaměstnavatele, v proměnlivém rozsahu a rozvržení pracovní
          doby, přičemž celkový rozsah práce nesmí překročit 300 hodin v
          kalendářním roce. Zaměstnanec se zavazuje provádět práce v řádné
          kvalitě, včas a dle pokynů Zaměstnavatele. Veškeré úkoly a instrukce
          bude dostávat prostřednictvím tzv. „briefingu" formou e-mailu nebo
          komunikační aplikace (např. WhatsApp). Zaměstnanec potvrzuje, že
          charakter práce je nepravidelný a závislý na aktuálních zakázkách
          Zaměstnavatele.
        </Text>

        <Text style={styles.sectionTitle}>II. Doba trvání dohody</Text>
        <Text style={styles.paragraph}>
          Tato dohoda se uzavírá na dobu určitou od dne podpisu této dohody do
          31.12.{data.rok}. Výkon práce bude probíhat dle potřeb Zaměstnavatele
          v průběhu této doby. Celkový rozsah práce nepřesáhne 300 hodin za
          kalendářní rok. Zaměstnavatel informuje zaměstnance o rozvržení směn
          zpravidla alespoň 3 dny předem; ve výjimečných případech může být
          tato lhůta kratší. Zaměstnanec je povinen mít tuto dohodu při výkonu
          práce dostupnou v digitální či tištěné podobě.
        </Text>

        <Text style={styles.sectionTitle}>III. Odměna zaměstnance</Text>
        <Text style={styles.paragraph}>
          Zaměstnanci náleží za vykonanou práci odměna, která se skládá z:
        </Text>
        <Text style={styles.bullet}>
          - základní hodinové odměny ve výši minimální mzdy stanovené platnými
          právními předpisy, včetně příplatků dle zákoníku práce (např. za
          práci v noci, o víkendu nebo ve svátek),
        </Text>
        <Text style={styles.bullet}>
          - pohyblivé složky odměny (bonus), která může být přiznána až do
          výše celkové odměny uvedené u konkrétní brigády zveřejněné na
          webovém rozhraní Zaměstnavatele (zejména crewmate.cz/brigady). Na
          přiznání bonusu nevzniká právní nárok a jeho výše závisí zejména na
          kvalitě odvedené práce, spolehlivosti a dodržení pokynů
          Zaměstnavatele.
        </Text>
        <Text style={styles.paragraph}>
          Náklady spojené s výkonem práce hradí Zaměstnavatel pouze tehdy,
          pokud byly předem schváleny písemně nebo elektronicky. Odměna bude
          vyplacena 15. den následujícího měsíce po vykonání práce. Změnu účtu
          pro výplatu mzdy musí Zaměstnanec oznámit bez zbytečného odkladu.
          Pojistné odvádí Zaměstnavatel dle zákona č. 582/1991 Sb. V případě,
          že se Zaměstnanec bez řádné a včasné omluvy nedostaví na potvrzenou
          směnu a nezajistí za sebe adekvátní náhradu schválenou
          Zaměstnavatelem, odpovídá za škodu tím způsobenou. Zaměstnavatel je
          v takovém případě oprávněn požadovat náhradu škody, zejména náklady
          spojené se zajištěním náhradního pracovníka či organizačním
          zajištěním akce, a to až do výše odpovídající těmto nákladům.
        </Text>

        <Text style={styles.sectionTitle}>IV. Práva a povinnosti Zaměstnance</Text>
        <Text style={styles.paragraph}>
          Zaměstnanec je povinen vykonávat svěřenou práci osobně, svědomitě a
          podle svých schopností. Je povinen dodržovat právní předpisy a
          pokyny Zaměstnavatele, docházet na místo výkonu práce včas a s
          potřebným vybavením. Zaměstnanec je povinen zachovávat mlčenlivost o
          všech skutečnostech, které se dozví v souvislosti s výkonem práce.
          Zaměstnanec je povinen chránit majetek a dobré jméno Zaměstnavatele.
          Zaměstnanec odpovídá za škodu způsobenou porušením povinností při
          výkonu práce. Zaměstnanec je povinen při výkonu práce dodržovat
          právní předpisy o bezpečnosti a ochraně zdraví při práci (BOZP),
          požární ochraně (PO) a ochraně životního prostředí. Prohlašuje, že
          se s těmito předpisy seznámil a má k nim trvalý přístup
          prostřednictvím odkazu:{" "}
          https://docs.google.com/document/d/1crlIvEK72elo_z8z95LyIjl8RyafLs0rGHXoqZbQR7k/edit?usp=sharing
        </Text>

        <Text style={styles.sectionTitle}>V. Povinnosti Zaměstnavatele</Text>
        <Text style={styles.paragraph}>
          Zaměstnavatel je povinen zajistit zaměstnanci podmínky pro bezpečný
          výkon práce. Zaměstnavatel může z provozních důvodů zrušit výkon
          práce bez nároku zaměstnance na náhradu odměny, pokud o tom
          informuje zaměstnance předem. Zaměstnavatel seznámil zaměstnance s
          právními a vnitřními předpisy vztahujícími se k výkonu práce.
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>VI. Dovolená a odpočinek</Text>
        <Text style={styles.paragraph}>
          Nárok na dovolenou vzniká pouze při splnění dvou podmínek:
        </Text>
        <Text style={styles.bullet}>
          - DPP trvá alespoň 4 týdny (28 dní), a
        </Text>
        <Text style={styles.bullet}>
          - Zaměstnanec odpracuje alespoň 80 hodin (20 hodin týdně).
        </Text>
        <Text style={styles.paragraph}>
          Výpočet dovolené se řídí § 213 zákoníku práce. Pokud podmínky nejsou
          splněny, nárok nevzniká. Zaměstnanci bude poskytnut denní odpočinek
          alespoň 11 hodin a týdenní odpočinek minimálně 35 hodin. Po 6
          hodinách práce má Zaměstnanec nárok na přestávku v trvání nejméně 30
          minut.
        </Text>

        <Text style={styles.sectionTitle}>VII. Autorská práva a osobní údaje</Text>
        <Text style={styles.paragraph}>
          Veškerá majetková autorská práva k dílům vzniklým při výkonu práce
          náleží Zaměstnavateli dle zákona č. 121/2000 Sb. Zaměstnanec souhlasí
          s používáním fotografií a videozáznamů z pracovních akcí pro
          marketingové účely Zaměstnavatele a jeho partnerů (např. partnerů,
          pro které jsou zakázky realizovány, či platforem, prostřednictvím
          nichž jsou odbavovány vstupenky). Zaměstnanec bere na vědomí, že
          jeho osobní údaje mohou být zpracovávány také prostřednictvím
          automatizovaných nástrojů, včetně nástrojů využívajících prvky umělé
          inteligence, a to za účelem:
        </Text>
        <Text style={styles.bullet}>- administrace pracovněprávního vztahu,</Text>
        <Text style={styles.bullet}>
          - zpracování docházky, odměn a podkladů pro účetnictví,
        </Text>
        <Text style={styles.bullet}>
          - zefektivnění interních procesů Zaměstnavatele.
        </Text>
        <Text style={styles.paragraph}>
          Toto zpracování probíhá v rozsahu nezbytném pro plnění této dohody a
          na základě oprávněného zájmu Zaměstnavatele. Zaměstnavatel se
          zavazuje, že při využití těchto nástrojů zajistí odpovídající
          ochranu osobních údajů dle platných právních předpisů, zejména dle
          GDPR.
        </Text>

        <Text style={styles.sectionTitle}>VIII. Ukončení dohody</Text>
        <Text style={styles.paragraph}>
          Tato dohoda může být ukončena kdykoli jednostranně nebo dohodou
          stran, bez výpovědní doby, s výjimkou již potvrzených směn, které je
          Zaměstnanec povinen vykonat, pokud se se Zaměstnavatelem nedohodne
          jinak. Výpověď či ukončení lze doručit písemně nebo elektronicky. Po
          skončení dohody je Zaměstnanec povinen vrátit všechny zapůjčené věci
          a dokumenty Zaměstnavateli.
        </Text>

        <Text style={styles.sectionTitle}>IX. Závěrečná ustanovení</Text>
        <Text style={styles.paragraph}>
          Tato dohoda nabývá účinnosti dnem elektronického podpisu oběma
          smluvními stranami. Smluvní strany prohlašují, že si obsah dohody
          přečetly, porozuměly mu a podepisují ji z vlastní vůle. Tato dohoda
          je uzavírána v jednom elektronickém vyhotovení, které bude podepsáno
          oběma smluvními stranami. Každá ze stran obdrží kopii tohoto
          vyhotovení s elektronickým podpisem druhé strany.
        </Text>

        <Text style={styles.sectionTitle}>X. Mlčenlivost</Text>
        <Text style={styles.paragraph}>
          Zaměstnanec se zavazuje zachovávat mlčenlivost o všech
          skutečnostech, informacích, datech a dokumentech, se kterými se
          seznámí v souvislosti s výkonem práce pro Zaměstnavatele, a to i po
          skončení této dohody. Povinnost mlčenlivosti se vztahuje zejména na
          obchodní, provozní, organizační, technické a finanční informace
          Zaměstnavatele a jeho partnerů či klientů, stejně jako na osobní
          údaje osob, se kterými přijde do styku. Zaměstnanec nesmí tyto
          informace bez souhlasu Zaměstnavatele sdělovat třetím osobám,
          rozmnožovat je, uchovávat mimo určené systémy ani jinak využívat k
          vlastnímu prospěchu nebo k újmě Zaměstnavatele. Porušení povinnosti
          mlčenlivosti se považuje za závažné porušení povinností vyplývajících
          z této dohody a může být důvodem k uplatnění náhrady škody nebo
          jiných právních kroků.
        </Text>

        <Text style={styles.date}>V Praze dne {val(data.datum_podpisu)}</Text>

        <View style={styles.signatureRow}>
          <View style={styles.signatureBox}>
            <Text>Zaměstnavatel:</Text>
            <Text>Crewmate s.r.o.</Text>
            <Text>Michal Hrachovický, jednatel</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Zaměstnanec:</Text>
            <Text>
              {val(data.jmeno)} {val(data.prijmeni)}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function generateDppPdf(data: DppData): Promise<Buffer> {
  const buffer = await renderToBuffer(<DppDocument data={data} />)
  return Buffer.from(buffer)
}
