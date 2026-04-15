-- Migration: Add koho_hledame and co_nabizime columns to nabidky
-- Date: 2026-04-16

ALTER TABLE nabidky ADD COLUMN IF NOT EXISTS koho_hledame text;
ALTER TABLE nabidky ADD COLUMN IF NOT EXISTS co_nabizime text;

COMMENT ON COLUMN nabidky.koho_hledame IS 'Popis hledaných pozic a požadavků pro veřejnou nabídku';
COMMENT ON COLUMN nabidky.co_nabizime IS 'Co nabízíme — benefity, podmínky pro veřejnou nabídku';
