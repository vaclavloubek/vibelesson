export class OrganizationEmailError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OrganizationEmailError';
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[char] ?? char;
  });
}

export async function sendOrganizationInvitationEmail(input: {
  invitationId: string;
  organizationName: string;
  recipient: string;
  invitationUrl: string;
  locale: 'cs' | 'en';
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) {
    throw new OrganizationEmailError('resend_api_key_missing');
  }

  const english = input.locale === 'en';
  const subject = english
    ? input.organizationName + ' invited you to Syllonaut'
    : input.organizationName + ' vás zve do Syllonautu';
  const title = english ? 'You have been invited to Syllonaut' : 'Pozvánka do Syllonautu';
  const body = english
    ? input.organizationName + ' has added you to its school licence. Sign in or create your Syllonaut account with this email address to accept the invitation.'
    : input.organizationName + ' vás přidala do své školní licence. Přihlaste se nebo si vytvořte účet Syllonaut s touto e-mailovou adresou a pozvánku přijměte.';
  const cta = english ? 'Accept invitation' : 'Přijmout pozvánku';

  const html =
    '<!doctype html><html lang="' + input.locale + '"><body style="margin:0;background:#f6f5f1;color:#151721;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;"><tr><td align="center">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2e1dc;border-radius:20px;"><tr><td style="padding:28px;">'
    + '<div style="font-size:18px;font-weight:800;margin-bottom:22px;">Syllonaut</div>'
    + '<h1 style="font-size:28px;letter-spacing:-.035em;margin:0 0 12px;">' + escapeHtml(title) + '</h1>'
    + '<p style="color:#686b74;line-height:1.65;margin:0;">' + escapeHtml(body) + '</p>'
    + '<p style="margin:26px 0 0;"><a href="' + escapeHtml(input.invitationUrl) + '" style="display:inline-block;padding:12px 17px;border-radius:10px;background:#5b57e8;color:#fff;text-decoration:none;font-weight:700;">'
    + escapeHtml(cta) + '</a></p></td></tr></table></td></tr></table></body></html>';

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'syllonaut:organization-invite:' + input.invitationId,
      },
      body: JSON.stringify({
        from: process.env.BILLING_EMAIL_FROM ?? 'Syllonaut <billing@syllonaut.com>',
        to: [input.recipient],
        reply_to: process.env.BILLING_EMAIL_REPLY_TO ?? 'vaclav@syllonaut.com',
        subject,
        text: title + '\n\n' + body + '\n\n' + input.invitationUrl,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OrganizationEmailError('resend_network_error');
  }

  if (!response.ok) throw new OrganizationEmailError('resend_http_' + response.status);
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!payload?.id) throw new OrganizationEmailError('resend_response_invalid');
  return payload.id;
}


export async function sendOrganizationRenewalReminderEmail(input: {
  organizationId: string;
  organizationName: string;
  recipient: string;
  periodEnd: string;
  days: 60 | 30 | 7;
  locale: 'cs' | 'en';
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) {
    throw new OrganizationEmailError('resend_api_key_missing');
  }

  const english = input.locale === 'en';
  const date = new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    timeZone: 'Europe/Prague',
  }).format(new Date(input.periodEnd));

  const subject = english
    ? input.organizationName + ' - Syllonaut licence renewal'
    : input.organizationName + ' - obnovení licence Syllonaut';
  const title = english ? 'Your school licence is approaching renewal' : 'Blíží se obnovení školní licence';
  const body = english
    ? 'Your Syllonaut school licence ends on ' + date + '. You can create a renewal invoice in My school. The next licence period activates only after confirmed payment.'
    : 'Školní licence Syllonaut končí ' + date + '. V sekci Moje škola můžete vystavit obnovovací fakturu. Nové licenční období se aktivuje až po potvrzené úhradě.';
  const cta = english ? 'Open My school' : 'Otevřít Moji školu';
  const renewalUrl = 'https://www.syllonaut.com/school';

  const html =
    '<!doctype html><html lang="' + input.locale + '"><body style="margin:0;background:#f6f5f1;color:#151721;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;"><tr><td align="center">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2e1dc;border-radius:20px;"><tr><td style="padding:28px;">'
    + '<div style="font-size:18px;font-weight:800;margin-bottom:22px;">Syllonaut</div>'
    + '<h1 style="font-size:28px;letter-spacing:-.035em;margin:0 0 12px;">' + escapeHtml(title) + '</h1>'
    + '<p style="color:#686b74;line-height:1.65;margin:0;">' + escapeHtml(body) + '</p>'
    + '<p style="margin:26px 0 0;"><a href="' + renewalUrl + '" style="display:inline-block;padding:12px 17px;border-radius:10px;background:#5b57e8;color:#fff;text-decoration:none;font-weight:700;">'
    + escapeHtml(cta) + '</a></p></td></tr></table></td></tr></table></body></html>';

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key':
          'syllonaut:organization-renewal:' + input.organizationId + ':'
          + input.periodEnd + ':' + input.days,
      },
      body: JSON.stringify({
        from: process.env.BILLING_EMAIL_FROM ?? 'Syllonaut <billing@syllonaut.com>',
        to: [input.recipient],
        reply_to: process.env.BILLING_EMAIL_REPLY_TO ?? 'vaclav@syllonaut.com',
        subject,
        text: title + '\n\n' + body + '\n\n' + renewalUrl,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OrganizationEmailError('resend_network_error');
  }

  if (!response.ok) throw new OrganizationEmailError('resend_http_' + response.status);
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!payload?.id) throw new OrganizationEmailError('resend_response_invalid');
  return payload.id;
}
