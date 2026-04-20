-- F-0013 Security Hardening — security_invoker=true pro views
-- Defense in depth: views budou respektovat RLS volajícího uživatele
-- Viz .agents/artifacts/E-0002/F-0013-data-foundation/05-security.md sekce 2.5

BEGIN;

ALTER VIEW v_brigadnik_zakazka_status SET (security_invoker = true);
ALTER VIEW v_brigadnici_aktualni       SET (security_invoker = true);
ALTER VIEW v_chybejici_dpp             SET (security_invoker = true);

COMMIT;
