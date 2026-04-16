-- Migration: Split adresa into ulice_cp, psc, mesto_bydliste, zeme
-- + update vzdelani check constraint
-- Date: 2026-04-16

-- New address fields (keep old adresa for backwards compatibility)
ALTER TABLE brigadnici ADD COLUMN IF NOT EXISTS ulice_cp text;
ALTER TABLE brigadnici ADD COLUMN IF NOT EXISTS psc text;
ALTER TABLE brigadnici ADD COLUMN IF NOT EXISTS mesto_bydliste text;
ALTER TABLE brigadnici ADD COLUMN IF NOT EXISTS zeme text DEFAULT 'Česká republika';

-- Drop old vzdelani constraint and replace with new one
ALTER TABLE brigadnici DROP CONSTRAINT IF EXISTS brigadnici_vzdelani_check;
ALTER TABLE brigadnici ADD CONSTRAINT brigadnici_vzdelani_check CHECK (vzdelani IN (
  'A', 'B', 'C', 'D', 'E', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'T', 'V', 'nevim',
  'zakladni', 'stredni_bez', 'stredni_s', 'vyssi_odborne', 'vysokoskolske'
));
