# Session Decisions — 16.4.2026 (Session 3)

## Rozhodnutí

### D-001: Nabídky filtr — oprava typů
- **Problém:** Filtr na nabídky používal `typ: "aktivni"/"stala"` místo reálných DB hodnot `jednorazova`/`prubezna`
- **Řešení:** Opraveno na správné hodnoty v `getNabidky()`
- **Dopad:** Filtry "Aktivní" a "Stálé" na /app/nabidky nyní fungují správně

### D-002: Nová pole zakázky — ukládání do existujících i nových sloupců
- **Problém:** Zadání vyžaduje "město", "koho hledáme", "co nabízíme" — DB nemá všechny sloupce
- **Řešení:** 
  - "Město" → existující `misto` pole (zůstává)
  - "Koho hledáme" → nový sloupec `koho_hledame` (migrace vytvořena)
  - "Co nabízíme" → nový sloupec `co_nabizime` (migrace vytvořena)
  - "Požadavky" → existující `pozadavky` pole (zůstává)
- **Migrace:** `supabase/migrations/20260416000000_nabidky_new_fields.sql`
- **Riziko:** Migrace musí být aplikována na Supabase ručně nebo přes CLI

### D-003: Brigádníci řazení — nejčastější + nejlepší
- **Problém:** Brigádníci řazeni pouze abecedně
- **Řešení:** Řazení: počet akcí DESC → hodnocení DESC → příjmení ASC
- **Implementace:** Enrichment v `getBrigadnici()` — join s prirazeni + smluvni_stav
- **Tradeoff:** Extra 2 SQL dotazy, ale pro <1000 brigádníků akceptovatelné

### D-004: City filter — extrakce měst z misto
- **Problém:** Potřeba filtrovat /prace podle města, ale žádné dedikované pole `mesto`
- **Řešení:** Extrakce měst z `nabidky.misto` — split by comma, vzít poslední segment
- **Tradeoff:** Funguje pro "SaSaZu, Praha 7" → "Praha 7", "Dolni oblast Vitkovice, Ostrava" → "Ostrava"

### D-005: CV/foto upload — Supabase Storage
- **Problém:** Přihláška nemá upload souborů
- **Řešení:** File inputs na PrihlaskaForm, upload do `crewmate-storage` bucketu
- **Cesta:** `prihlasky/{brigadnik_id}/cv/` a `prihlasky/{brigadnik_id}/foto/`
- **Validace:** MIME type check (PDF/DOC/DOCX pro CV, JPG/PNG/HEIC pro foto), max 20 MB

### D-006: Blue tint — pouze na photo strip
- **Problém:** Handoff říkal "blue tint na fotkách", ale crewmate.cz má tint pouze na photo stripu v Zkušenostech
- **Řešení:** CSS `.blue-tint` class s `mix-blend-mode: multiply`, aplikováno pouze na photo strip
- **Zdůvodnění:** Vizuální konzistence s crewmate.cz

### D-007: Admin hodiny — hodinová sazba 250 Kč/h
- **Problém:** Metrika "náklad na nabraného / na akci" potřebuje hodinovou sazbu
- **Řešení:** Hardcoded 250 Kč/h jako průměr
- **Follow-up:** Mělo by být konfigurovatelné v nastavení

### D-008: Pipeline mobile fallback
- **Problém:** D&D nefunguje spolehlivě na touch zařízeních
- **Řešení:** Select dropdown na mobile (`md:hidden`) pro změnu stavu bez D&D
- **Tradeoff:** Dva UI patterny (D&D na desktop, select na mobile) — ale lepší UX

## Audit Issues (P0/P1 opraveno)
1. Rate limiting na `submitPrihlaska` — přidáno (5 pokusů / 10 min per email)
2. Nabidky filtr bug — opraven (špatné hodnoty typů)
3. Edit dialog — přidány chybějící pole (pozadavky, datum_od, datum_do)
4. Brigadnik foto alt text — opraven (accessibility)
5. Nabidka detail — přidáno zobrazení nových polí
