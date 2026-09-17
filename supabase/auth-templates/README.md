# Syllonaut Auth email templates

Tyto soubory jsou zdrojové kopie šablon pro hosted Supabase Dashboard. Samy se do Supabase nenasazují.

## Confirm signup

- Subject: `Potvrďte svůj účet v Syllonautu`
- Template: `confirm-signup.html`
- CTA míří na `{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

## Reset password

- Subject: `Obnovení hesla v Syllonautu`
- Template: `recovery.html`
- CTA míří na `{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.

`AuthControls` vždy předává `emailRedirectTo` / `redirectTo` jako aktuální origin aplikace. Proto musí Supabase Redirect URL allowlist obsahovat pouze důvěryhodné originy, na kterých má auth flow fungovat.

Odkaz z e-mailu token nespotřebuje při prvním GET. `/auth/confirm` zobrazí mezistránku a `verifyOtp` proběhne až po uživatelském POST na `/auth/confirm/verify`; to chrání flow před automatickým prefetchováním odkazů e-mailovými bezpečnostními skenery.

Pro auth odesílání musí zůstat vypnuté click tracking i open tracking. Žádný SMTP/API secret nepatří do repository ani do `NEXT_PUBLIC_*` proměnných.
