-- ============================================================
-- Seed cleanup — odstranění AUDIT + TEST dat před cutoverem
-- Datum:  Připraveno 2026-04-27, spustit krátce před 2026-05-15
-- Zdroj:  handoff_audit_session_end_22_04.md §4
-- Scope:  100 audit brigádníků + 5 AUDIT zakázek + 15 AUDIT akcí +
--         233 pipeline entries + všechna data s emailem @example.test
--
-- ⚠️ DESTRUKTIVNÍ — spustit pouze po explicitním potvrzení uživatele.
-- ⚠️ PŘED SPUŠTĚNÍM:
--     1. pg_dump nebo Supabase snapshot (full backup)
--     2. Spustit DRY RUN blok (níže) a ověřit očekávané counts:
--        ~100 brigádníků, 5 nabidky, 15 akce, 233 pipeline
--     3. Pokud reálné counts výrazně liší, NESPOUŠTĚT real run —
--        ověřit, zda se audit data nezměnila / nepřibyla produkční.
-- ⚠️ Nepublikovat v migrations/ — toto NENÍ schema migrace, je to
--     jednorázový ops skript.
-- ⚠️ LIKE patterns:
--     '%(AUDIT)%'            — AUDIT zakázky
--     '%@test.crewmate.cz'   — audit brigádníci
--     '%@example.test'       — staré TEST brigádníci
--     Safety rail: všechny DELETE mají navíc AND created_at < CUTOFF,
--     aby se nesmazalo nic vytvořeného po 2026-04-23 00:00 UTC
--     (konec audit session 22.4. večer).
-- ============================================================

-- Helper pro opakované použití pattern-match:
--   Ve WHERE:  email ~ '@(test\.crewmate\.cz|example\.test)$' AND created_at < '2026-04-23 00:00:00+00'

-- ============================================================
-- DRY RUN — ověřit counts. Skončí ROLLBACKem, nic nesmaže.
-- ============================================================
BEGIN;

SELECT 'pipeline_entries (AUDIT nabidky)' AS tabulka, COUNT(*) AS smazano
FROM pipeline_entries pe
JOIN nabidky n ON pe.nabidka_id = n.id
WHERE n.nazev LIKE '%(AUDIT)%'
  AND n.created_at < '2026-04-23 00:00:00+00';

SELECT 'akce (AUDIT nabidky)' AS tabulka, COUNT(*) AS smazano
FROM akce a
JOIN nabidky n ON a.nabidka_id = n.id
WHERE n.nazev LIKE '%(AUDIT)%'
  AND n.created_at < '2026-04-23 00:00:00+00';

SELECT 'nabidky (AUDIT)' AS tabulka, COUNT(*) AS smazano
FROM nabidky
WHERE nazev LIKE '%(AUDIT)%'
  AND created_at < '2026-04-23 00:00:00+00';

SELECT 'brigadnici (audit domain)' AS tabulka, COUNT(*) AS smazano
FROM brigadnici
WHERE email LIKE '%@test.crewmate.cz'
  AND created_at < '2026-04-23 00:00:00+00';

SELECT 'brigadnici (test domain)' AS tabulka, COUNT(*) AS smazano
FROM brigadnici
WHERE email LIKE '%@example.test'
  AND created_at < '2026-04-23 00:00:00+00';

ROLLBACK;  -- dry run, jen ukáže counts

-- ============================================================
-- REAL RUN — odkomentovat po ověření dry-run counts a backup.
-- ============================================================
--
-- BEGIN;
--
-- -- Vymez IDs brigádníků k smazání (safety rail: created_at < cutoff)
-- CREATE TEMP TABLE tmp_brig_to_delete AS
-- SELECT id FROM brigadnici
--  WHERE (email LIKE '%@test.crewmate.cz' OR email LIKE '%@example.test')
--    AND created_at < '2026-04-23 00:00:00+00';
--
-- CREATE TEMP TABLE tmp_nab_to_delete AS
-- SELECT id FROM nabidky
--  WHERE nazev LIKE '%(AUDIT)%'
--    AND created_at < '2026-04-23 00:00:00+00';
--
-- CREATE TEMP TABLE tmp_akce_to_delete AS
-- SELECT id FROM akce WHERE nabidka_id IN (SELECT id FROM tmp_nab_to_delete);
--
-- -- 1. Dochazka + přiřazení → závislé na brigádníkech i akci
-- DELETE FROM dochazka
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete)
--     OR akce_id      IN (SELECT id FROM tmp_akce_to_delete);
--
-- DELETE FROM prirazeni
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete)
--     OR akce_id      IN (SELECT id FROM tmp_akce_to_delete);
--
-- -- 2. Hodnocení (ON DELETE RESTRICT v hodnoceni_brigadnika → musí dřív)
-- DELETE FROM hodnoceni_brigadnika
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 3. Smluvní stav (archiv)
-- DELETE FROM smluvni_stav
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 4. Email threads + messages + attachments
-- DELETE FROM email_attachments
--  WHERE message_id IN (
--    SELECT id FROM email_messages WHERE thread_id IN (
--      SELECT id FROM email_threads
--       WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete)
--    )
--  );
-- DELETE FROM email_messages
--  WHERE thread_id IN (
--    SELECT id FROM email_threads
--     WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete)
--  );
-- DELETE FROM email_threads
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 5. Document records
-- DELETE FROM document_records
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 6. Formulář tokeny
-- DELETE FROM formular_tokeny
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 7. Historie (audit log — smazat jen záznamy vázané na audit data)
-- DELETE FROM historie
--  WHERE brigadnik_id IN (SELECT id FROM tmp_brig_to_delete)
--     OR nabidka_id   IN (SELECT id FROM tmp_nab_to_delete)
--     OR akce_id      IN (SELECT id FROM tmp_akce_to_delete);
--
-- -- 8. Pipeline entries + akce + nabidky
-- DELETE FROM pipeline_entries
--  WHERE nabidka_id IN (SELECT id FROM tmp_nab_to_delete);
-- DELETE FROM akce
--  WHERE id IN (SELECT id FROM tmp_akce_to_delete);
-- DELETE FROM nabidky
--  WHERE id IN (SELECT id FROM tmp_nab_to_delete);
--
-- -- 9. Konečně brigádníky
-- DELETE FROM brigadnici
--  WHERE id IN (SELECT id FROM tmp_brig_to_delete);
--
-- -- 10. Sanity check po smazání — všechno by mělo být 0
-- SELECT 'post_cleanup' AS stage,
--   (SELECT COUNT(*) FROM nabidky    WHERE nazev LIKE '%(AUDIT)%')           AS audit_nabidky,
--   (SELECT COUNT(*) FROM brigadnici WHERE email LIKE '%@test.crewmate.cz')  AS audit_brig,
--   (SELECT COUNT(*) FROM brigadnici WHERE email LIKE '%@example.test')      AS test_brig;
--
-- DROP TABLE tmp_brig_to_delete;
-- DROP TABLE tmp_nab_to_delete;
-- DROP TABLE tmp_akce_to_delete;
--
-- COMMIT;
-- ============================================================
