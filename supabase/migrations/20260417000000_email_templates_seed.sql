-- Seed email templates for DPP and Prohlášení
-- These are used by sendDocumentAction to pre-fill email body

INSERT INTO email_sablony (nazev, predmet, obsah_html, typ, aktivni) VALUES
(
  'DPP k podpisu',
  'DPP k podpisu — {{mesic}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>v příloze Vám zasíláme <strong>Dohodu o provedení práce (DPP)</strong> na měsíc <strong>{{mesic}}</strong>.</p>
<div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
<p style="margin: 0 0 8px 0;"><strong>Jak postupovat:</strong></p>
<ol style="margin: 0; padding-left: 20px;">
<li>Otevřete přílohu (PDF)</li>
<li>Vytiskněte dokument</li>
<li>Podepište na vyznačeném místě</li>
<li>Naskenujte nebo vyfoťte celý podepsaný dokument</li>
<li>Pošlete zpět na tento email jako přílohu</li>
</ol>
</div>
<p>Pokud máte jakékoliv dotazy, neváhejte odpovědět na tento email.</p>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>',
  'dpp',
  true
),
(
  'Prohlášení k podpisu',
  'Prohlášení poplatníka — {{mesic}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>v příloze Vám zasíláme <strong>Prohlášení poplatníka daně</strong> (růžové prohlášení) na měsíc <strong>{{mesic}}</strong>.</p>
<div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
<p style="margin: 0 0 8px 0;"><strong>Jak postupovat:</strong></p>
<ol style="margin: 0; padding-left: 20px;">
<li>Otevřete přílohu (PDF)</li>
<li>Vyplňte datum a podpis</li>
<li>Naskenujte nebo vyfoťte celý podepsaný dokument</li>
<li>Pošlete zpět na tento email jako přílohu</li>
</ol>
</div>
<p>Pokud máte jakékoliv dotazy, neváhejte odpovědět na tento email.</p>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>',
  'prohlaseni',
  true
),
(
  'Dotazník — osobní údaje',
  'Crewmate — vyplňte prosím osobní údaje',
  '<div style="font-family: Arial, sans-serif; max-width: 600px;">
<h2>Dobrý den, {{jmeno}},</h2>
<p>pro dokončení registrace potřebujeme doplnit Vaše osobní údaje.</p>
<p>Klikněte prosím na odkaz níže a vyplňte dotazník:</p>
<div style="text-align: center; margin: 24px 0;">
<a href="{{odkaz_formular}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Vyplnit dotazník</a>
</div>
<p style="color: #666; font-size: 12px;">Odkaz je platný 30 dní. Pokud máte jakékoliv dotazy, neváhejte odpovědět na tento email.</p>
<p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
</div>',
  'dotaznik',
  true
)
ON CONFLICT DO NOTHING;
