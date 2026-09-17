# Syllonaut Auth email templates

Zdrojové kopie transakčních auth šablon pro hosted Supabase Dashboard. Samy se do Supabase nenasazují.

Vizuální směr odpovídá design systému **Orbital Precision**: teplé světlé pozadí `#f6f5f1`, bílá karta, indigo CTA `#5b57e8`, tmavý ink `#151721`, systémový font stack a jemná kosmická metafora. Šablony nepoužívají externí obrázky ani vzdálené fonty, aby byly robustní i v přísných e-mailových klientech.

## Přehled šablon

| Supabase template | Subject | Soubor | Stav v produktu |
| --- | --- | --- | --- |
| Confirm sign up | `Dokončete registraci do Syllonautu` | `confirm-signup.html` | aktivně používané |
| Reset password | `Obnovení hesla k Syllonautu` | `recovery.html` | aktivně používané |
| Invite user | `Pozvání do Syllonautu` | `invite.html` | připravené pro budoucí týmové/školní účty |
| Magic link | `Přihlášení do Syllonautu` | `magic-link.html` | připravené, nyní se nepoužívá |
| Change email address | `Potvrďte novou e-mailovou adresu` | `email-change.html` | připravené, nyní se nepoužívá |
| Reauthentication | `Potvrzení bezpečnostní akce v Syllonautu` | `reauthentication.html` | připravené, nyní se nepoužívá |

## Aktivní scanner-safe flow

`Confirm sign up` a `Reset password` používají vlastní token-hash odkazy:

- signup: `{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
- recovery: `{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

`AuthControls` předává `emailRedirectTo` / `redirectTo` jako aktuální origin aplikace. Supabase Redirect URL allowlist proto musí obsahovat pouze důvěryhodné originy, na kterých má auth flow fungovat.

Odkaz z těchto dvou e-mailů token nespotřebuje při prvním GET. `/auth/confirm` zobrazí mezistránku a `verifyOtp` proběhne až po uživatelském POST na `/auth/confirm/verify`; tím se flow chrání před automatickým prefetchováním odkazů e-mailovými bezpečnostními skenery.

## Budoucí auth flow

`Invite user`, `Magic link` a `Change email address` zatím používají standardní Supabase `{{ .ConfirmationURL }}`, protože tyto funkce Syllonaut v současnosti neposkytuje. Pokud se některá z nich začne produktově používat, je potřeba před spuštěním převést její odkaz na stejný scanner-safe `TokenHash → potvrzovací stránka → POST verifyOtp` model jako u registrace a recovery.

`Reauthentication` používá jednorázový `{{ .Token }}` a žádný potvrzovací odkaz.

## Provozní pravidla

- Sender: `Syllonaut <noreply@auth.syllonaut.com>`.
- Click tracking i open tracking musí zůstat pro auth odesílání vypnuté.
- SMTP/API secret nepatří do repository ani do `NEXT_PUBLIC_*` proměnných.
- Šablony jsou česky a používají vykání, stejně jako veřejný auth mailingový tok.
- Bezpečnostní maily mají srozumitelnost před kosmickou metaforou; výraznější brandová metafora je pouze u welcome/invite mailu.
- Při změně HTML je potřeba zachovat Supabase template proměnné doslova včetně složených závorek.
