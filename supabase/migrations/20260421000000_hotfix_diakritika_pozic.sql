-- HF2 — Diakritika v typ_pozice
-- Datum: 2026-04-21
-- Epic: E-0002 (hotfix před start)
--
-- Aktualizuje existující hodnoty v nabidky.typ_pozice a prirazeni.pozice
-- na verze s diakritikou. Tabulka nemá CHECK constraint na typ_pozice,
-- takže UPDATE je jednoduchý. TS konstanta TYP_POZICE_OPTIONS se mění
-- v samostatném commitu.

BEGIN;

-- nabidky.typ_pozice
UPDATE nabidky SET typ_pozice = 'šatnář'      WHERE typ_pozice = 'satnar';
UPDATE nabidky SET typ_pozice = 'vstupář'     WHERE typ_pozice = 'vstupar';
UPDATE nabidky SET typ_pozice = 'hosteska'    WHERE typ_pozice = 'hostesa';
UPDATE nabidky SET typ_pozice = 'úklid'       WHERE typ_pozice = 'uklid';
UPDATE nabidky SET typ_pozice = 'koordinátor' WHERE typ_pozice = 'koordinator';
UPDATE nabidky SET typ_pozice = 'bezpečnost'  WHERE typ_pozice = 'bezpecnost';
-- 'barman' a 'produkce' už diakritiku nemají mít

-- prirazeni.pozice
UPDATE prirazeni SET pozice = 'šatnář'      WHERE pozice = 'satnar';
UPDATE prirazeni SET pozice = 'vstupář'     WHERE pozice = 'vstupar';
UPDATE prirazeni SET pozice = 'hosteska'    WHERE pozice = 'hostesa';
UPDATE prirazeni SET pozice = 'úklid'       WHERE pozice = 'uklid';
UPDATE prirazeni SET pozice = 'koordinátor' WHERE pozice = 'koordinator';
UPDATE prirazeni SET pozice = 'bezpečnost'  WHERE pozice = 'bezpecnost';

COMMIT;
