import { Resend, type WebhookEventPayload } from 'resend';

const MAX_TRANSACTION_AGE_MS = 8 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1_000;
const MAX_AMOUNT_MINOR = 2_147_483_647;

export type OrganizationBankEmailConfig = {
  forwarderEmail: string;
  inboxEmail: string;
};

export type OrganizationBankEmailInput = {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  headers: Record<string, string>;
};

export type OrganizationBankEmailTransaction = {
  variableSymbol: string;
  amountMinor: number;
  currency: 'czk' | 'eur' | 'usd';
  bankReference: string;
  receivedAt: Date;
  gmailMessageId: string;
  bookedAt: string;
};

function normalizedAddress(value: string) {
  const bracketed = value.match(/<([^<>]+)>/);
  return (bracketed?.[1] ?? value).trim().toLowerCase();
}
function normalizedHeader(headers: Record<string, string>, name: string) {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? headers[key] ?? '' : '';
}

function parseAmountMinor(value: string) {
  const normalized = value.trim().replaceAll(' ', '').replaceAll('\u00a0', '');
  let major: string;
  let minor: string;

  const commaDecimal = normalized.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  const dotDecimal = normalized.match(/^(\d+)\.(\d{2})$/);
  const whole = normalized.match(/^(\d+)$/);

  if (commaDecimal) {
    major = commaDecimal[1].replaceAll('.', '');
    minor = commaDecimal[2];
  } else if (dotDecimal) {
    major = dotDecimal[1];
    minor = dotDecimal[2];
  } else if (whole) {
    major = whole[1];
    minor = '00';
  } else {
    throw new Error('bank_email_amount_invalid');
  }

  const amountMinor = Number(major) * 100 + Number(minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    throw new Error('bank_email_amount_invalid');
  }
  return amountMinor;
}

function parseBookedAt(value: string) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) throw new Error('bank_email_booked_at_invalid');

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('bank_email_booked_at_invalid');
  }
  return value;
}

function parseStructuredFields(text: string) {
  const marker = '\n\n--- original message ---';
  const normalized = text.replaceAll('\r\n', '\n');
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) throw new Error('bank_email_structure_invalid');

  const fieldLines = normalized.slice(0, markerIndex).split('\n');
  const fields = new Map<string, string>();
  for (const line of fieldLines) {
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error('bank_email_structure_invalid');
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || !value || fields.has(key)) {
      throw new Error('bank_email_structure_invalid');
    }
    fields.set(key, value);
  }

  const required = [
    'source',
    'gmail_message_id',
    'received_at',
    'amount',
    'currency',
    'variable_symbol',
    'booked_at',
    'transaction_code',
  ];
  if (fields.size !== required.length || required.some((key) => !fields.has(key))) {
    throw new Error('bank_email_structure_invalid');
  }
  return fields;
}

function assertGmailAuthentication(headers: Record<string, string>) {
  const authentication = normalizedHeader(headers, 'authentication-results');
  const gmailDkimPassed = /\bdkim=pass\b[^;\r\n]*(?:header\.(?:i|d)=@?gmail\.com)\b/i
    .test(authentication);
  const gmailDmarcPassed = /\bdmarc=pass\b[^;\r\n]*header\.from=gmail\.com\b/i
    .test(authentication);

  if (!gmailDkimPassed || !gmailDmarcPassed) {
    throw new Error('bank_email_authentication_failed');
  }
}

export function parseOrganizationBankEmail(
  input: OrganizationBankEmailInput,
  config: OrganizationBankEmailConfig,
  now = Date.now(),
): OrganizationBankEmailTransaction {
  if (normalizedAddress(input.from) !== config.forwarderEmail.trim().toLowerCase()) {
    throw new Error('bank_email_sender_rejected');
  }
  if (!input.to.some((recipient) => (
    normalizedAddress(recipient) === config.inboxEmail.trim().toLowerCase()
  ))) {
    throw new Error('bank_email_recipient_rejected');
  }

  assertGmailAuthentication(input.headers);

  if (!input.text || Buffer.byteLength(input.text, 'utf8') > 100_000) {
    throw new Error('bank_email_text_invalid');
  }
  const fields = parseStructuredFields(input.text);
  if (fields.get('source') !== 'gmail-apps-script-v1') {
    throw new Error('bank_email_source_rejected');
  }

  const gmailMessageId = fields.get('gmail_message_id') ?? '';
  if (!/^[a-f0-9]{8,128}$/i.test(gmailMessageId)) {
    throw new Error('bank_email_message_id_invalid');
  }

  const receivedAt = new Date(fields.get('received_at') ?? '');
  if (
    !Number.isFinite(receivedAt.getTime())
    || receivedAt.getTime() < now - MAX_TRANSACTION_AGE_MS
    || receivedAt.getTime() > now + MAX_FUTURE_SKEW_MS
  ) {
    throw new Error('bank_email_received_at_invalid');
  }

  const variableSymbol = fields.get('variable_symbol') ?? '';
  if (!/^[0-9]{1,10}$/.test(variableSymbol)) {
    throw new Error('bank_email_variable_symbol_invalid');
  }

  const currencyValue = (fields.get('currency') ?? '').toLowerCase();
  if (currencyValue !== 'czk' && currencyValue !== 'eur' && currencyValue !== 'usd') {
    throw new Error('bank_email_currency_invalid');
  }

  const bankReference = fields.get('transaction_code') ?? '';
  if (!/^[A-Za-z0-9-]{1,100}$/.test(bankReference)) {
    throw new Error('bank_email_reference_invalid');
  }
  if (input.subject !== `[Syllonaut Air Bank] ${bankReference}`) {
    throw new Error('bank_email_subject_invalid');
  }

  return {
    variableSymbol,
    amountMinor: parseAmountMinor(fields.get('amount') ?? ''),
    currency: currencyValue,
    bankReference,
    receivedAt,
    gmailMessageId,
    bookedAt: parseBookedAt(fields.get('booked_at') ?? ''),
  };
}

export function verifyResendBankWebhook(input: {
  apiKey: string;
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
  webhookSecret: string;
}) {
  const resend = new Resend(input.apiKey);
  return resend.webhooks.verify({
    payload: input.payload,
    headers: {
      id: input.id,
      timestamp: input.timestamp,
      signature: input.signature,
    },
    webhookSecret: input.webhookSecret,
  }) as WebhookEventPayload;
}
