-- Migration: F-0002 — Kompletní Crewmate DB Schema
-- Date: 2026-04-15
-- Author: Data Agent
--
-- Zapracovaná rozhodnutí:
--   R-001: Pipeline 4+1 stavový model
--   R-002: Bez tabulky smeny
--   R-006: ON DELETE RESTRICT na brigadnici
--   Šifrování RČ + OP na app layer (sloupce text)

BEGIN;

-- ============================================================
-- Helper: updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. users — Uživatelé systému (admin, náborářky)
-- ============================================================

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid UNIQUE NOT NULL,  -- reference na auth.users
  email         text UNIQUE NOT NULL,
  jmeno         text NOT NULL,
  prijmeni      text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'naborar')),
  aktivni       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE users IS 'Interní uživatelé systému (admin, náborářky). Koordinátoři zde nejsou.';
COMMENT ON COLUMN users.auth_user_id IS 'FK na Supabase auth.users.id';

-- ============================================================
-- 2. brigadnici — Brigádníci (centrální evidence)
-- ============================================================

CREATE TABLE brigadnici (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Základní údaje (z přihlášky)
  jmeno                   text NOT NULL,
  prijmeni                text NOT NULL,
  email                   text NOT NULL,
  telefon                 text NOT NULL,

  -- Osobní údaje (z dotazníku — NULL dokud nevyplní)
  rodne_cislo             text,          -- šifrováno na app layer (AES-256-GCM)
  rodne_jmeno             text,
  rodne_prijmeni          text,
  datum_narozeni          date,
  misto_narozeni          text,
  adresa                  text,
  korespondencni_adresa   text,
  cislo_op                text,          -- šifrováno na app layer (AES-256-GCM)
  zdravotni_pojistovna    text,          -- kód: '111', '201', '205', '207', '209', '211', '213'
  cislo_uctu              text,
  kod_banky               text,
  vzdelani                text CHECK (vzdelani IN (
                            'zakladni', 'stredni_bez', 'stredni_s', 'vyssi_odborne', 'vysokoskolske'
                          )),
  student                 boolean,
  nazev_skoly             text,
  uplatnuje_slevu_jinde   boolean,

  -- Metadata
  zdroj                   text CHECK (zdroj IN ('web', 'doporuceni', 'recrujobs', 'rucne', 'import')),
  poznamky                text,
  foto_url                text,
  cv_url                  text,
  dotaznik_vyplnen        boolean NOT NULL DEFAULT false,
  dotaznik_vyplnen_at     timestamptz,
  gdpr_souhlas            boolean NOT NULL DEFAULT false,
  gdpr_souhlas_at         timestamptz,

  aktivni                 boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brigadnici_jmeno ON brigadnici (prijmeni, jmeno);
CREATE INDEX idx_brigadnici_email ON brigadnici (email);
CREATE INDEX idx_brigadnici_telefon ON brigadnici (telefon);
CREATE INDEX idx_brigadnici_aktivni ON brigadnici (aktivni) WHERE aktivni = true;

CREATE TRIGGER set_updated_at_brigadnici
  BEFORE UPDATE ON brigadnici
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE brigadnici IS 'Centrální evidence brigádníků. Existují globálně, nezávisle na nabídkách.';
COMMENT ON COLUMN brigadnici.rodne_cislo IS 'Šifrováno AES-256-GCM na aplikační vrstvě';
COMMENT ON COLUMN brigadnici.cislo_op IS 'Šifrováno AES-256-GCM na aplikační vrstvě';

-- ============================================================
-- 3. nabidky — Pracovní nabídky (zakázky)
-- ============================================================

CREATE TABLE nabidky (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev             text NOT NULL,
  typ               text NOT NULL CHECK (typ IN ('jednorazova', 'prubezna')),
  klient            text,
  typ_pozice        text,  -- 'barman', 'vstupar', 'satnar', 'hostesa', 'bezpecnost', 'uklid', 'produkce', 'koordinator'
  popis_prace       text,
  pozadavky         text,
  odmena            text,  -- text, flexibilní formát: "150 Kč/hod"
  misto             text,
  datum_od          date,
  datum_do          date,
  pocet_lidi        integer,
  slug              text UNIQUE,
  zverejnena        boolean NOT NULL DEFAULT false,
  stav              text NOT NULL DEFAULT 'aktivni' CHECK (stav IN ('aktivni', 'pozastavena', 'ukoncena')),
  naborar_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nabidky_stav ON nabidky (stav);
CREATE INDEX idx_nabidky_slug ON nabidky (slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_nabidky_zverejnena ON nabidky (zverejnena) WHERE zverejnena = true;

CREATE TRIGGER set_updated_at_nabidky
  BEFORE UPDATE ON nabidky
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. pipeline_entries — Brigádník v pipeline nabídky
-- ============================================================

CREATE TABLE pipeline_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  nabidka_id      uuid NOT NULL REFERENCES nabidky(id) ON DELETE CASCADE,
  stav            text NOT NULL DEFAULT 'zajemce' CHECK (stav IN (
                    'zajemce',
                    'kontaktovan',
                    'prijaty_nehotova_admin',
                    'prijaty_vse_vyreseno',
                    'odmitnuty'
                  )),
  poznamky        text,
  naborar_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pipeline_entries_unique_brigadnik_nabidka
    UNIQUE (brigadnik_id, nabidka_id)
);

CREATE INDEX idx_pipeline_nabidka ON pipeline_entries (nabidka_id, stav);
CREATE INDEX idx_pipeline_brigadnik ON pipeline_entries (brigadnik_id);

CREATE TRIGGER set_updated_at_pipeline_entries
  BEFORE UPDATE ON pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN pipeline_entries.stav IS 'R-001: 4+1 stavový model. Granulární stavy (DPP stav atd.) odvoditelné z jiných tabulek.';

-- ============================================================
-- 5. akce — Jednotlivé eventy
-- ============================================================

CREATE TABLE akce (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev           text NOT NULL,
  datum           date NOT NULL,
  cas_od          time,
  cas_do          time,
  misto           text,
  klient          text,
  nabidka_id      uuid REFERENCES nabidky(id) ON DELETE SET NULL,
  pocet_lidi      integer,
  poznamky        text,
  pin_kod         text,  -- 6-místný, generovaný systémem
  stav            text NOT NULL DEFAULT 'planovana' CHECK (stav IN ('planovana', 'probehla', 'zrusena')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_akce_datum ON akce (datum);
CREATE INDEX idx_akce_nabidka ON akce (nabidka_id);
CREATE INDEX idx_akce_stav ON akce (stav);

CREATE TRIGGER set_updated_at_akce
  BEFORE UPDATE ON akce
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN akce.pin_kod IS 'R-003: 6-místný PIN pro koordinátora. Ověření přes POST s rate limiting.';
COMMENT ON TABLE akce IS 'R-002: Bez tabulky smeny. Akce = jedna směna. Různé pozice přes prirazeni.pozice.';

-- ============================================================
-- 6. prirazeni — Přiřazení brigádníka na akci
-- ============================================================

CREATE TABLE prirazeni (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  akce_id         uuid NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  pozice          text,
  status          text NOT NULL DEFAULT 'prirazeny' CHECK (status IN (
                    'prirazeny',
                    'nahradnik',
                    'vypadl'
                  )),
  poradi_nahradnik integer,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prirazeni_unique_akce_brigadnik
    UNIQUE (akce_id, brigadnik_id)
);

CREATE INDEX idx_prirazeni_akce ON prirazeni (akce_id, status);
CREATE INDEX idx_prirazeni_brigadnik ON prirazeni (brigadnik_id);

-- ============================================================
-- 7. dochazka — Zápis docházky
-- ============================================================

CREATE TABLE dochazka (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prirazeni_id    uuid NOT NULL UNIQUE REFERENCES prirazeni(id) ON DELETE CASCADE,
  akce_id         uuid NOT NULL REFERENCES akce(id) ON DELETE RESTRICT,
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  prichod         time,
  odchod          time,
  hodin_celkem    numeric(4,1) GENERATED ALWAYS AS (
                    CASE
                      WHEN prichod IS NOT NULL AND odchod IS NOT NULL THEN
                        CASE
                          WHEN odchod > prichod THEN
                            EXTRACT(EPOCH FROM (odchod - prichod)) / 3600
                          ELSE
                            EXTRACT(EPOCH FROM (odchod + INTERVAL '24 hours' - prichod)) / 3600
                        END
                      ELSE NULL
                    END
                  ) STORED,
  hodnoceni       integer CHECK (hodnoceni BETWEEN 1 AND 5),
  poznamka        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dochazka_akce ON dochazka (akce_id);
CREATE INDEX idx_dochazka_brigadnik ON dochazka (brigadnik_id);

CREATE TRIGGER set_updated_at_dochazka
  BEFORE UPDATE ON dochazka
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN dochazka.hodin_celkem IS 'Computed: automaticky z příchod/odchod, řeší přechod přes půlnoc.';

-- ============================================================
-- 8. smluvni_stav — DPP + prohlášení per měsíc
-- ============================================================

CREATE TABLE smluvni_stav (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id          uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  mesic                 date NOT NULL,   -- první den měsíce (2026-04-01)

  -- DPP
  dpp_stav              text NOT NULL DEFAULT 'zadny' CHECK (dpp_stav IN (
                          'zadny', 'vygenerovano', 'odeslano', 'podepsano'
                        )),
  dpp_vygenerovano_at   timestamptz,
  dpp_odeslano_at       timestamptz,
  dpp_podepsano_at      timestamptz,
  dpp_dokument_id       uuid,
  dpp_podpis_dokument_id uuid,

  -- Prohlášení
  prohlaseni_stav       text NOT NULL DEFAULT 'zadny' CHECK (prohlaseni_stav IN (
                          'zadny', 'vygenerovano', 'odeslano', 'podepsano'
                        )),
  prohlaseni_vygenerovano_at timestamptz,
  prohlaseni_odeslano_at     timestamptz,
  prohlaseni_podepsano_at    timestamptz,
  prohlaseni_dokument_id     uuid,
  prohlaseni_podpis_dokument_id uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT smluvni_stav_unique_brigadnik_mesic
    UNIQUE (brigadnik_id, mesic)
);

CREATE INDEX idx_smluvni_stav_mesic ON smluvni_stav (mesic);
CREATE INDEX idx_smluvni_stav_brigadnik ON smluvni_stav (brigadnik_id);

CREATE TRIGGER set_updated_at_smluvni_stav
  BEFORE UPDATE ON smluvni_stav
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. dokumenty — Uložené soubory
-- ============================================================

CREATE TABLE dokumenty (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  typ             text NOT NULL CHECK (typ IN (
                    'dpp', 'dpp_podpis', 'prohlaseni', 'prohlaseni_podpis',
                    'cv', 'foto', 'jiny'
                  )),
  nazev           text NOT NULL,
  storage_path    text NOT NULL,
  mesic           date,
  velikost        integer,
  mime_type       text,
  nahral_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dokumenty_brigadnik ON dokumenty (brigadnik_id, typ);
CREATE INDEX idx_dokumenty_mesic ON dokumenty (mesic) WHERE mesic IS NOT NULL;

-- Add FK from smluvni_stav to dokumenty (after dokumenty exists)
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_dpp_dokument_fk
    FOREIGN KEY (dpp_dokument_id) REFERENCES dokumenty(id) ON DELETE SET NULL;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_dpp_podpis_fk
    FOREIGN KEY (dpp_podpis_dokument_id) REFERENCES dokumenty(id) ON DELETE SET NULL;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_prohlaseni_dokument_fk
    FOREIGN KEY (prohlaseni_dokument_id) REFERENCES dokumenty(id) ON DELETE SET NULL;
ALTER TABLE smluvni_stav
  ADD CONSTRAINT smluvni_stav_prohlaseni_podpis_fk
    FOREIGN KEY (prohlaseni_podpis_dokument_id) REFERENCES dokumenty(id) ON DELETE SET NULL;

-- ============================================================
-- 10. formular_tokeny — Tokeny pro veřejné formuláře
-- ============================================================

CREATE TABLE formular_tokeny (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  typ             text NOT NULL CHECK (typ IN ('dotaznik')),
  vyplneno        boolean NOT NULL DEFAULT false,
  vyplneno_at     timestamptz,
  expiruje_at     timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_formular_token ON formular_tokeny (token) WHERE vyplneno = false;

-- ============================================================
-- 11. email_sablony — Šablony emailů
-- ============================================================

CREATE TABLE email_sablony (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev           text NOT NULL,
  predmet         text NOT NULL,
  obsah_html      text NOT NULL,
  typ             text CHECK (typ IN ('dotaznik', 'dpp', 'prohlaseni', 'potvrzeni', 'vlastni')),
  aktivni         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_email_sablony
  BEFORE UPDATE ON email_sablony
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. historie — Audit log
-- ============================================================

CREATE TABLE historie (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id    uuid REFERENCES brigadnici(id) ON DELETE SET NULL,
  akce_id         uuid REFERENCES akce(id) ON DELETE SET NULL,
  nabidka_id      uuid REFERENCES nabidky(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  typ             text NOT NULL,
  popis           text NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historie_brigadnik ON historie (brigadnik_id, created_at DESC);
CREATE INDEX idx_historie_typ ON historie (typ);
CREATE INDEX idx_historie_created ON historie (created_at DESC);

COMMENT ON COLUMN historie.typ IS 'Values: pipeline_zmena, email_odeslan, dotaznik_vyplnen, dpp_vygenerovano, dokument_nahran, prirazeni_zmena, dochazka_zapsana';

-- ============================================================
-- VIEWS
-- ============================================================

-- Brigádníci s DPP stavem pro aktuální měsíc
CREATE VIEW v_brigadnici_aktualni AS
SELECT
  b.*,
  ss.dpp_stav,
  ss.prohlaseni_stav,
  COALESCE(stats.prumerne_hodnoceni, 0) AS prumerne_hodnoceni,
  COALESCE(stats.pocet_akci, 0) AS pocet_akci
FROM brigadnici b
LEFT JOIN smluvni_stav ss
  ON ss.brigadnik_id = b.id
  AND ss.mesic = date_trunc('month', CURRENT_DATE)
LEFT JOIN (
  SELECT
    brigadnik_id,
    AVG(hodnoceni)::numeric(3,1) AS prumerne_hodnoceni,
    COUNT(DISTINCT akce_id) AS pocet_akci
  FROM dochazka
  WHERE hodnoceni IS NOT NULL
  GROUP BY brigadnik_id
) stats ON stats.brigadnik_id = b.id
WHERE b.aktivni = true;

-- Měsíční docházka pro export
CREATE VIEW v_mesicni_dochazka AS
SELECT
  a.nazev AS akce_nazev,
  a.datum AS akce_datum,
  b.id AS brigadnik_id,
  b.jmeno,
  b.prijmeni,
  b.rodne_cislo,  -- šifrováno, dešifrovat v app layer
  p.pozice,
  d.prichod,
  d.odchod,
  d.hodin_celkem,
  d.hodnoceni
FROM dochazka d
JOIN prirazeni p ON p.id = d.prirazeni_id
JOIN akce a ON a.id = d.akce_id
JOIN brigadnici b ON b.id = d.brigadnik_id
ORDER BY a.datum, a.nazev, b.prijmeni;

-- Kdo nemá DPP pro daný měsíc (ale je přiřazený na akci)
CREATE VIEW v_chybejici_dpp AS
SELECT DISTINCT
  b.id,
  b.jmeno,
  b.prijmeni,
  b.telefon,
  a.datum AS akce_datum,
  a.nazev AS akce_nazev,
  COALESCE(ss.dpp_stav, 'zadny') AS dpp_stav,
  COALESCE(ss.prohlaseni_stav, 'zadny') AS prohlaseni_stav
FROM prirazeni p
JOIN brigadnici b ON b.id = p.brigadnik_id
JOIN akce a ON a.id = p.akce_id
LEFT JOIN smluvni_stav ss
  ON ss.brigadnik_id = b.id
  AND ss.mesic = date_trunc('month', a.datum)
WHERE p.status = 'prirazeny'
  AND COALESCE(ss.dpp_stav, 'zadny') != 'podepsano';

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

-- Pravidla: authenticated users vidí vše (malý tým 3 lidí)
-- Koordinátor: přes service role v API (ne přes RLS)
-- Veřejné endpointy: přes service role v API (ne přes RLS)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brigadnici ENABLE ROW LEVEL SECURITY;
ALTER TABLE nabidky ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE akce ENABLE ROW LEVEL SECURITY;
ALTER TABLE prirazeni ENABLE ROW LEVEL SECURITY;
ALTER TABLE dochazka ENABLE ROW LEVEL SECURITY;
ALTER TABLE smluvni_stav ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumenty ENABLE ROW LEVEL SECURITY;
ALTER TABLE formular_tokeny ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sablony ENABLE ROW LEVEL SECURITY;
ALTER TABLE historie ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "authenticated_read_users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_users" ON users FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- Brigadnici
CREATE POLICY "authenticated_read_brigadnici" ON brigadnici FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_brigadnici" ON brigadnici FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_brigadnici" ON brigadnici FOR UPDATE TO authenticated USING (true);

-- Nabidky
CREATE POLICY "authenticated_all_nabidky" ON nabidky FOR ALL TO authenticated USING (true);
CREATE POLICY "public_read_nabidky" ON nabidky FOR SELECT TO anon
  USING (zverejnena = true AND stav = 'aktivni');

-- Pipeline entries
CREATE POLICY "authenticated_all_pipeline" ON pipeline_entries FOR ALL TO authenticated USING (true);

-- Akce
CREATE POLICY "authenticated_all_akce" ON akce FOR ALL TO authenticated USING (true);

-- Prirazeni
CREATE POLICY "authenticated_all_prirazeni" ON prirazeni FOR ALL TO authenticated USING (true);

-- Dochazka
CREATE POLICY "authenticated_all_dochazka" ON dochazka FOR ALL TO authenticated USING (true);

-- Smluvni stav
CREATE POLICY "authenticated_all_smluvni_stav" ON smluvni_stav FOR ALL TO authenticated USING (true);

-- Dokumenty
CREATE POLICY "authenticated_all_dokumenty" ON dokumenty FOR ALL TO authenticated USING (true);

-- Formular tokeny
CREATE POLICY "authenticated_all_formular_tokeny" ON formular_tokeny FOR ALL TO authenticated USING (true);

-- Email sablony
CREATE POLICY "authenticated_all_email_sablony" ON email_sablony FOR ALL TO authenticated USING (true);

-- Historie
CREATE POLICY "authenticated_read_historie" ON historie FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_historie" ON historie FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;
