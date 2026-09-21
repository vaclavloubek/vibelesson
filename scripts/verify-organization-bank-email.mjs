import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import {
  parseOrganizationBankEmail,
  verifyResendBankWebhook,
} from '../lib/organization-bank-email.ts';

const now = Date.parse('2026-09-21T10:00:00.000Z');
const config = {
  forwarderEmail: 'owner@example.com',
  inboxEmail: 'bank@example.resend.app',
};

function body(overrides = {}) {
  const fields = {
    source: 'gmail-apps-script-v1',
    gmail_message_id: '1a0c35d43d0a34ff',
    received_at: '2026-09-21T09:55:00.000Z',
    amount: '12.345,67',
    currency: 'CZK',
    variable_symbol: '987654321',
    booked_at: '21.09.2026',
    transaction_code: '169562406752',
    ...overrides,
  };
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
    + '\n\n--- original message ---\nAir Bank body';
}

function email(overrides = {}) {
  return {
    from: 'Syllonaut Air Bank Bridge <owner@example.com>',
    to: ['bank@example.resend.app'],
    subject: '[Syllonaut Air Bank] 169562406752',
    text: body(),
    headers: {
      'authentication-results': 'mx.example; dkim=pass header.i=@gmail.com; dmarc=pass header.from=gmail.com',
    },
    ...overrides,
  };
}

const parsed = parseOrganizationBankEmail(email(), config, now);
assert.equal(parsed.amountMinor, 1_234_567);
assert.equal(parsed.currency, 'czk');
assert.equal(parsed.variableSymbol, '987654321');
assert.equal(parsed.bankReference, '169562406752');

assert.throws(
  () => parseOrganizationBankEmail(email({ from: 'attacker@example.com' }), config, now),
  /bank_email_sender_rejected/,
);
assert.throws(
  () => parseOrganizationBankEmail(email({ headers: {} }), config, now),
  /bank_email_authentication_failed/,
);
assert.throws(
  () => parseOrganizationBankEmail(email({ subject: '[Syllonaut Air Bank] wrong' }), config, now),
  /bank_email_subject_invalid/,
);
assert.throws(
  () => parseOrganizationBankEmail(email({ text: body({ amount: '-1,00' }) }), config, now),
  /bank_email_amount_invalid/,
);
assert.throws(
  () => parseOrganizationBankEmail(email({ text: body({ received_at: '2026-08-01T00:00:00.000Z' }) }), config, now),
  /bank_email_received_at_invalid/,
);
assert.throws(
  () => parseOrganizationBankEmail(email({
    text: body().replace(
      '\n\n--- original message ---',
      '\nsource: gmail-apps-script-v1\n\n--- original message ---',
    ),
  }), config, now),
  /bank_email_structure_invalid/,
);

const webhookSecret = `whsec_${Buffer.from('syllonaut-bank-regression-secret').toString('base64')}`;
const webhookPayload = JSON.stringify({
  type: 'email.received',
  created_at: '2026-09-21T10:00:00.000Z',
  data: {
    email_id: 'email_123',
    created_at: '2026-09-21T10:00:00.000Z',
    from: 'owner@example.com',
    to: ['bank@example.resend.app'],
    bcc: [],
    cc: [],
    message_id: '<message@example.com>',
    subject: '[Syllonaut Air Bank] 169562406752',
    attachments: [],
  },
});
const webhookId = 'msg_123456789';
const webhookTimestamp = new Date();
const webhookTimestampSeconds = Math.floor(webhookTimestamp.getTime() / 1_000);
const webhookSignature = `v1,${createHmac(
  'sha256',
  Buffer.from(webhookSecret.slice('whsec_'.length), 'base64'),
).update(`${webhookId}.${webhookTimestampSeconds}.${webhookPayload}`).digest('base64')}`;
const verified = verifyResendBankWebhook({
  apiKey: 're_regression_only',
  payload: webhookPayload,
  id: webhookId,
  timestamp: String(webhookTimestampSeconds),
  signature: webhookSignature,
  webhookSecret,
});
assert.equal(verified.type, 'email.received');
assert.throws(() => verifyResendBankWebhook({
  apiKey: 're_regression_only',
  payload: webhookPayload + ' ',
  id: webhookId,
  timestamp: String(webhookTimestampSeconds),
  signature: webhookSignature,
  webhookSecret,
}));

const route = fs.readFileSync('app/api/billing/bank/resend/route.ts', 'utf8');
for (const requirement of [
  'request.text()',
  'verifyResendBankWebhook',
  'resend.emails.receiving.get',
  'parseOrganizationBankEmail',
  'matchOrganizationBankTransaction',
  "event.type !== 'email.received'",
  "return json(200, { accepted: false, reason: 'event_ignored' })",
]) {
  assert.ok(route.includes(requirement), `Missing bank webhook requirement: ${requirement}`);
}

console.log('Organization bank email checks passed.');
