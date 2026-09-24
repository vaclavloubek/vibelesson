// Branded Syllonaut copies of the Managed Neon Auth (Better Auth) emails.
// The visual language mirrors supabase/auth-templates (Orbital Precision):
// warm #f6f5f1 background, white card, indigo #5b57e8 CTA or code, ink #151721,
// system font stack, no remote images or fonts.

export type NeonAuthEmailLocale = 'cs' | 'en';
export type NeonAuthEmailPurpose = 'sign-in' | 'email-verification' | 'forget-password';

export type NeonAuthEmailAction =
  | { channel: 'link'; purpose: NeonAuthEmailPurpose; href: string; expiresAt: string | null }
  | { channel: 'code'; purpose: NeonAuthEmailPurpose; code: string; expiresAt: string | null };

export type RenderedNeonAuthEmail = { subject: string; text: string; html: string };

export type NeonAuthWebhookPayload = {
  event_id?: unknown;
  event_type?: unknown;
  user?: { id?: unknown; email?: unknown } | null;
  event_data?: Record<string, unknown> | null;
};

const PURPOSES = new Set<NeonAuthEmailPurpose>(['sign-in', 'email-verification', 'forget-password']);

export class NeonAuthEmailPayloadError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'NeonAuthEmailPayloadError';
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Converts a verified Neon Auth webhook payload into the single action the
 * email must carry. Links are only accepted when they point at the Neon Auth
 * endpoint itself; password-reset links are rewritten to go straight to the
 * app's reset form on an allowlisted origin, so the email shows a Syllonaut
 * URL and the first GET never touches the token.
 */
export function neonAuthEmailAction(
  payload: NeonAuthWebhookPayload,
  options: { authBaseUrl: string; allowedAppOrigins: readonly string[] },
): { recipient: string; eventId: string; userId: string | null; action: NeonAuthEmailAction } {
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
  if (!/^[A-Za-z0-9-]{8,80}$/.test(eventId)) throw new NeonAuthEmailPayloadError('event_id_invalid');

  const recipient = typeof payload.user?.email === 'string' ? payload.user.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) {
    throw new NeonAuthEmailPayloadError('recipient_invalid');
  }
  const userId = typeof payload.user?.id === 'string' ? payload.user.id : null;

  const data = payload.event_data ?? {};
  const expiresAt = typeof data.expires_at === 'string' && !Number.isNaN(Date.parse(data.expires_at))
    ? data.expires_at
    : null;

  if (payload.event_type === 'send.otp') {
    const purpose = data.otp_type as NeonAuthEmailPurpose;
    if (!PURPOSES.has(purpose)) throw new NeonAuthEmailPayloadError('otp_type_unsupported');
    if (data.delivery_preference !== undefined && data.delivery_preference !== 'email') {
      throw new NeonAuthEmailPayloadError('delivery_channel_unsupported');
    }
    const code = typeof data.otp_code === 'string' ? data.otp_code : '';
    if (!/^[A-Za-z0-9]{4,12}$/.test(code)) throw new NeonAuthEmailPayloadError('otp_code_invalid');
    return { recipient, eventId, userId, action: { channel: 'code', purpose, code, expiresAt } };
  }

  if (payload.event_type === 'send.magic_link') {
    const purpose = data.link_type as NeonAuthEmailPurpose;
    if (!PURPOSES.has(purpose)) throw new NeonAuthEmailPayloadError('link_type_unsupported');
    const linkUrl = typeof data.link_url === 'string' ? data.link_url : '';
    let link: URL;
    try {
      link = new URL(linkUrl);
    } catch {
      throw new NeonAuthEmailPayloadError('link_url_invalid');
    }
    const authBase = new URL(options.authBaseUrl);
    if (link.protocol !== 'https:' || link.origin !== authBase.origin) {
      throw new NeonAuthEmailPayloadError('link_url_untrusted');
    }

    let href = link.toString();
    if (purpose === 'forget-password') {
      const token = typeof data.token === 'string' ? data.token : '';
      const callback = link.searchParams.get('callbackURL') ?? '';
      const callbackOrigin = originOf(callback);
      if (/^[A-Za-z0-9_-]{8,256}$/.test(token)
        && callbackOrigin
        && options.allowedAppOrigins.includes(callbackOrigin)
        && new URL(callback).pathname === '/auth/update-password') {
        const target = new URL('/auth/update-password', callbackOrigin);
        target.searchParams.set('token', token);
        href = target.toString();
      }
    }
    return { recipient, eventId, userId, action: { channel: 'link', purpose, href, expiresAt } };
  }

  throw new NeonAuthEmailPayloadError('event_type_unsupported');
}

function validityNote(expiresAt: string | null, now: Date, locale: NeonAuthEmailLocale) {
  if (!expiresAt) return '';
  const minutes = Math.round((Date.parse(expiresAt) - now.getTime()) / 60_000);
  if (minutes < 1) return '';
  if (locale === 'en') {
    if (minutes >= 90) {
      const hours = Math.round(minutes / 60);
      return `It is valid for ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
    }
    return `It is valid for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  }
  if (minutes >= 90) {
    const hours = Math.round(minutes / 60);
    return `Platnost vyprší za ${hours} ${hours < 5 ? 'hodiny' : 'hodin'}.`;
  }
  const unit = minutes === 1 ? 'minutu' : minutes < 5 ? 'minuty' : 'minut';
  return `Platnost vyprší za ${minutes} ${unit}.`;
}

type Copy = {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  lead: string;
  cta?: string;
  note: string;
};

function copyFor(action: NeonAuthEmailAction, locale: NeonAuthEmailLocale): Copy {
  const code = action.channel === 'code';
  if (locale === 'en') {
    switch (action.purpose) {
      case 'forget-password':
        return {
          subject: 'Reset your Syllonaut password',
          preheader: code ? 'Use this code to set a new password.' : 'Use this link to set a new password.',
          eyebrow: 'Security',
          heading: 'Set a new password',
          lead: code
            ? 'We received a request to change the password for your Syllonaut account. Enter this one-time code in Syllonaut:'
            : 'We received a request to change the password for your Syllonaut account. Use the button below to set a new one.',
          cta: 'Set new password',
          note: 'If you did not ask to change your password, you can ignore this email. Your current password stays unchanged.',
        };
      case 'email-verification':
        return {
          subject: 'Finish signing up for Syllonaut',
          preheader: 'Confirm your email address to start using Syllonaut.',
          eyebrow: 'New account',
          heading: 'Welcome aboard',
          lead: code
            ? 'Your Syllonaut account is almost ready. Enter this one-time code in Syllonaut to confirm your email address:'
            : 'Your Syllonaut account is almost ready. Confirm your email address and start creating, saving and running interactive lessons.',
          cta: 'Confirm email',
          note: 'This message is meant only for you. If you did not create a Syllonaut account, you can ignore it.',
        };
      case 'sign-in':
        return {
          subject: 'Sign in to Syllonaut',
          preheader: code ? 'Your one-time sign-in code.' : 'Your one-time sign-in link.',
          eyebrow: 'Sign in',
          heading: code ? 'Your sign-in code' : 'Sign in without a password',
          lead: code
            ? 'Enter this one-time code in Syllonaut to sign in:'
            : 'Use this link to sign in to Syllonaut securely. The link works only once.',
          cta: 'Sign in',
          note: 'Never share this with anyone. If you did not try to sign in, you can ignore this email.',
        };
    }
  }
  switch (action.purpose) {
    case 'forget-password':
      return {
        subject: 'Obnovení hesla k Syllonautu',
        preheader: code ? 'Tímto kódem si nastavíte nové heslo.' : 'Pomocí tohoto odkazu si můžete nastavit nové heslo.',
        eyebrow: 'Bezpečnost',
        heading: 'Nastavte si nové heslo',
        lead: code
          ? 'Obdrželi jsme žádost o změnu hesla k vašemu účtu v Syllonautu. Zadejte v Syllonautu následující jednorázový kód:'
          : 'Obdrželi jsme žádost o změnu hesla k vašemu účtu v Syllonautu. Pomocí tlačítka níže si můžete nastavit nové.',
        cta: 'Nastavit nové heslo',
        note: 'Pokud jste o změnu hesla nežádali, nic nemusíte dělat. Vaše současné heslo zůstává beze změny.',
      };
    case 'email-verification':
      return {
        subject: 'Dokončete registraci do Syllonautu',
        preheader: 'Potvrďte svou e-mailovou adresu a začněte Syllonaut používat.',
        eyebrow: 'Nový účet',
        heading: 'Vítejte na palubě',
        lead: code
          ? 'Účet v Syllonautu je téměř připravený. Svou e-mailovou adresu potvrdíte zadáním tohoto jednorázového kódu v Syllonautu:'
          : 'Účet v Syllonautu je téměř připravený. Potvrďte svou e-mailovou adresu a můžete začít vytvářet, ukládat a vést interaktivní hodiny.',
        cta: 'Potvrdit e-mail',
        note: 'Zpráva je určena pouze pro vás. Pokud jste si účet v Syllonautu nevytvářeli, můžete ji ignorovat.',
      };
    case 'sign-in':
      return {
        subject: 'Přihlášení do Syllonautu',
        preheader: code ? 'Váš jednorázový přihlašovací kód.' : 'Váš jednorázový přihlašovací odkaz.',
        eyebrow: 'Přihlášení',
        heading: code ? 'Váš přihlašovací kód' : 'Přihlásit se bez hesla',
        lead: code
          ? 'Pro přihlášení do Syllonautu zadejte následující jednorázový kód:'
          : 'Pomocí tohoto odkazu se bezpečně přihlásíte do Syllonautu. Odkaz je jednorázový.',
        cta: 'Přihlásit se',
        note: 'Nikomu ho nesdělujte. Pokud jste se nepřihlašovali, zprávu můžete ignorovat.',
      };
  }
}

export function renderNeonAuthEmail(
  action: NeonAuthEmailAction,
  locale: NeonAuthEmailLocale,
  now: Date = new Date(),
): RenderedNeonAuthEmail {
  const copy = copyFor(action, locale);
  const validity = validityNote(action.expiresAt, now, locale);
  const tagline = locale === 'en' ? 'AI navigator for interactive teaching' : 'AI navigátor pro interaktivní výuku';
  const footnote = locale === 'en'
    ? 'This email was sent automatically in connection with your Syllonaut account.'
    : 'Tento e-mail byl odeslán automaticky v souvislosti s vaším účtem v Syllonautu.';
  const fallbackLabel = locale === 'en'
    ? 'If the button does not work, copy this address into your browser:'
    : 'Pokud tlačítko nefunguje, zkopírujte do prohlížeče tuto adresu:';
  const note = [copy.note, validity].filter(Boolean).join(' ');

  const actionHtml = action.channel === 'code'
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 26px;">
              <tr><td align="center" style="padding:18px 16px;border:1px solid #d9d7fb;border-radius:12px;background:#f1f0fe;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:28px;line-height:1.1;font-weight:700;letter-spacing:0.14em;color:#5b57e8;">${escapeHtml(action.code)}</td></tr>
            </table>`
    : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
              <tr><td style="border-radius:10px;background:#5b57e8;">
                <a href="${escapeHtml(action.href)}" style="display:inline-block;padding:13px 20px;font-size:15px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(copy.cta ?? '')}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 22px;font-size:12px;line-height:1.55;color:#686b74;">${escapeHtml(fallbackLabel)}<br><a href="${escapeHtml(action.href)}" style="color:#5b57e8;text-decoration:underline;word-break:break-all;">${escapeHtml(action.href)}</a></p>`;

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(copy.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f5f1;color:#151721;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f6f5f1;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:580px;background:#ffffff;border:1px solid #e2e1dc;border-radius:18px;">
          <tr><td style="padding:32px 34px 30px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
              <tr>
                <td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:11px;background:#151721;"><img src="https://www.syllonaut.com/email/syllonaut-mark.png" width="36" height="36" alt="Syllonaut" style="display:block;border:0;border-radius:11px;"></td>
                <td style="padding-left:10px;">
                  <div style="font-size:17px;line-height:1.2;font-weight:700;color:#151721;">Syllonaut</div>
                  <div style="margin-top:2px;font-size:11px;line-height:1.35;color:#686b74;">${escapeHtml(tagline)}</div>
                </td>
              </tr>
            </table>
            <div style="margin:0 0 10px;font-size:10px;line-height:1.4;font-weight:800;letter-spacing:0.11em;text-transform:uppercase;color:#686b74;">${escapeHtml(copy.eyebrow)}</div>
            <h1 style="margin:0 0 13px;font-size:28px;line-height:1.15;letter-spacing:-0.03em;color:#151721;font-weight:700;">${escapeHtml(copy.heading)}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#4f525b;">${escapeHtml(copy.lead)}</p>
            ${actionHtml}
            <p style="margin:0;font-size:13px;line-height:1.6;color:#686b74;">${escapeHtml(note)}</p>
            <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e1dc;">
              <div style="font-size:11px;line-height:1.5;color:#686b74;">Syllonaut · ${escapeHtml(tagline)}</div>
              <div style="margin-top:3px;font-size:11px;line-height:1.5;color:#686b74;">syllonaut.com</div>
            </div>
          </td></tr>
        </table>
        <div style="max-width:580px;padding:14px 8px 0;font-size:10px;line-height:1.5;color:#686b74;text-align:center;">${escapeHtml(footnote)}</div>
      </td></tr>
    </table>
  </body>
</html>
`;

  const text = [
    copy.heading,
    '',
    copy.lead,
    '',
    action.channel === 'code' ? action.code : `${copy.cta}: ${action.href}`,
    '',
    note,
    '',
    `Syllonaut · ${tagline}`,
    'syllonaut.com',
  ].join('\n');

  return { subject: copy.subject, text, html };
}
