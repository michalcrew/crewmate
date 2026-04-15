-- Migration: Add dokument_sablony + pracovni_zkusenosti tables
-- These are referenced in code but were missing from initial schema
-- Date: 2026-04-16

BEGIN;

-- ============================================================
-- dokument_sablony — DPP/prohlášení HTML šablony s verzováním
-- ============================================================

CREATE TABLE IF NOT EXISTS dokument_sablony (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev           text NOT NULL,
  typ             text NOT NULL CHECK (typ IN ('dpp', 'prohlaseni')),
  obsah_html      text NOT NULL,
  aktivni         boolean NOT NULL DEFAULT true,
  platnost_od     date NOT NULL,
  platnost_do     date,
  poznamka        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dokument_sablony_typ ON dokument_sablony (typ, aktivni, platnost_od DESC);

CREATE TRIGGER set_updated_at_dokument_sablony
  BEFORE UPDATE ON dokument_sablony
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dokument_sablony ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_dokument_sablony" ON dokument_sablony FOR ALL TO authenticated USING (true);

COMMENT ON TABLE dokument_sablony IS 'HTML šablony pro DPP a prohlášení. Verzované přes platnost_od/do.';

-- ============================================================
-- pracovni_zkusenosti — Pracovní zkušenosti brigádníka
-- ============================================================

CREATE TABLE IF NOT EXISTS pracovni_zkusenosti (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigadnik_id    uuid NOT NULL REFERENCES brigadnici(id) ON DELETE RESTRICT,
  pozice          text NOT NULL,
  popis           text,
  typ             text NOT NULL CHECK (typ IN ('interni', 'externi')),
  zdroj           text NOT NULL CHECK (zdroj IN ('cv_ai', 'manual', 'interni')),
  datum_od        date,
  datum_do        date,
  akce_id         uuid REFERENCES akce(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pracovni_zkusenosti_brigadnik ON pracovni_zkusenosti (brigadnik_id);
CREATE INDEX IF NOT EXISTS idx_pracovni_zkusenosti_pozice ON pracovni_zkusenosti USING gin (to_tsvector('simple', pozice));

CREATE TRIGGER set_updated_at_pracovni_zkusenosti
  BEFORE UPDATE ON pracovni_zkusenosti
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pracovni_zkusenosti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_pracovni_zkusenosti" ON pracovni_zkusenosti FOR ALL TO authenticated USING (true);

COMMENT ON TABLE pracovni_zkusenosti IS 'Pracovní zkušenosti brigádníka — z CV (AI), manuálně zadané, nebo automaticky z interních akcí.';
COMMENT ON COLUMN pracovni_zkusenosti.zdroj IS 'cv_ai = vytěženo z CV, manual = zadáno ručně, interni = auto z dokončené akce';

-- ============================================================
-- naborar_hodiny — pokud neexistuje
-- ============================================================

CREATE TABLE IF NOT EXISTS naborar_hodiny (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  datum           date NOT NULL,
  hodin           numeric(4,1) NOT NULL,
  misto_prace     text NOT NULL CHECK (misto_prace IN ('kancelar', 'remote', 'akce')),
  napln_prace     text NOT NULL,
  je_zpetny_zapis boolean NOT NULL DEFAULT false,
  duvod_zpozdeni  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT naborar_hodiny_unique_user_datum UNIQUE (user_id, datum)
);

CREATE TRIGGER set_updated_at_naborar_hodiny
  BEFORE UPDATE ON naborar_hodiny
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE naborar_hodiny ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_naborar_hodiny" ON naborar_hodiny FOR ALL TO authenticated USING (true);

COMMIT;
