import React from "react"
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Font } from "@react-pdf/renderer"

Font.register({
  family: "Helvetica",
  src: undefined as unknown as string, // Built-in font
})

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.5 },
  title: { fontSize: 16, textAlign: "center", marginBottom: 4, fontWeight: "bold" },
  subtitle: { fontSize: 10, textAlign: "center", color: "#666", marginBottom: 20 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#ddd", paddingBottom: 4 },
  row: { flexDirection: "row", borderWidth: 1, borderColor: "#ddd" },
  cellLabel: { width: "40%", padding: 6, backgroundColor: "#f9f9f9", borderRightWidth: 1, borderRightColor: "#ddd" },
  cellValue: { width: "60%", padding: 6 },
  paragraph: { marginBottom: 8 },
  signatureRow: { flexDirection: "row", marginTop: 60, justifyContent: "space-between" },
  signatureBox: { width: "40%", borderTopWidth: 1, borderTopColor: "#000", paddingTop: 8, textAlign: "center" },
  footer: { textAlign: "center", fontSize: 8, color: "#999", marginTop: 20 },
})

type DppData = {
  jmeno: string
  prijmeni: string
  rodne_cislo: string
  datum_narozeni: string
  adresa: string
  cislo_op: string
  zdravotni_pojistovna: string
  cislo_uctu: string
  kod_banky: string
  mesicLabel: string
}

function DppDocument({ data }: { data: DppData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>DOHODA O PROVEDENÍ PRÁCE</Text>
        <Text style={styles.subtitle}>uzavřená dle § 75 zákona č. 262/2006 Sb., zákoník práce</Text>
        <Text style={{ textAlign: "center", marginBottom: 20 }}>na měsíc: {data.mesicLabel}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Zaměstnavatel</Text>
          <Text>Crewmate s.r.o.</Text>
          <Text>IČO: 23782587</Text>
          <Text>Sídlo: Revoluční 1403/28, Nové Město, 110 00 Praha 1</Text>
          <Text>Zastoupený: Michal Lipovský, jednatel</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Zaměstnanec</Text>
          {[
            ["Jméno a příjmení", `${data.jmeno} ${data.prijmeni}`],
            ["Rodné číslo", data.rodne_cislo],
            ["Datum narození", data.datum_narozeni],
            ["Trvalé bydliště", data.adresa],
            ["Číslo OP", data.cislo_op],
            ["Zdravotní pojišťovna", data.zdravotni_pojistovna],
            ["Číslo účtu", `${data.cislo_uctu}/${data.kod_banky}`],
          ].map(([label, value]) => (
            <View style={styles.row} key={label}>
              <Text style={styles.cellLabel}>{label}</Text>
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Druh práce</Text>
          <Text style={styles.paragraph}>
            Pomocné práce při zajištění eventu (obsluha šatny, vstupní servis, bar, úklid, produkce a další dle pokynů zaměstnavatele).
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Rozsah práce</Text>
          <Text style={styles.paragraph}>
            Maximálně 300 hodin v kalendářním roce. Práce bude vykonávána dle aktuální potřeby zaměstnavatele.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Odměna</Text>
          <Text style={styles.paragraph}>
            Odměna bude sjednána pro každou akci zvlášť, minimálně však ve výši minimální mzdy.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Doba trvání</Text>
          <Text style={styles.paragraph}>
            Tato dohoda se uzavírá na dobu určitou: {data.mesicLabel}.
          </Text>
        </View>

        <View style={styles.signatureRow}>
          <View style={styles.signatureBox}>
            <Text>Zaměstnavatel</Text>
            <Text style={{ fontSize: 8, color: "#666" }}>Crewmate s.r.o.</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Zaměstnanec</Text>
            <Text style={{ fontSize: 8, color: "#666" }}>{data.jmeno} {data.prijmeni}</Text>
          </View>
        </View>

        <Text style={styles.footer}>V Praze dne _______________</Text>
      </Page>
    </Document>
  )
}

export async function generateDppPdf(data: DppData): Promise<Buffer> {
  const buffer = await renderToBuffer(<DppDocument data={data} />)
  return Buffer.from(buffer)
}
