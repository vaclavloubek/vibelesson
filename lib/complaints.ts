import 'server-only';
import { createHash } from 'node:crypto';
import { BillingEmailDeliveryError, sendResendEmail } from '@/lib/billing-email';
import {
  COMPLAINT_OUTCOMES,
  COMPLAINT_REMEDIES,
  COMPLAINT_RESOLUTION_DAYS,
  COMPLAINT_SUBJECT_AREAS,
  type ComplaintOutcome,
  type ComplaintRemedy,
  type ComplaintSubjectArea,
} from '@/lib/complaint-options';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';

// LEGAL-017: complaints are evidenced in append-only Neon tables (migration
// 0011). Until that migration exists the feature reports itself unavailable
// and the public page falls back to the email channel.

const MAX_COMPLAINTS_PER_DAY = 5;

export class ComplaintError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

type ComplaintRow = {
  id: string;
  user_id: string;
  submitted_at: string | Date;
  resolution_due_at: string | Date;
  locale: 'cs' | 'en';
  contact_email: string;
  customer_name: string;
  subject_area: ComplaintSubjectArea;
  description: string;
  requested_remedy: ComplaintRemedy;
  remedy_note: string | null;
  plan_context: string | null;
  payload_sha256: string;
};

type ResolutionRow = {
  resolved_at: string | Date | null;
  outcome: ComplaintOutcome | null;
  remedy_applied: string | null;
  explanation: string | null;
  resolution_sha256: string | null;
};

type DeliveryKind = 'receipt' | 'resolution';

const iso = (value: string | Date) => (value instanceof Date ? value : new Date(value)).toISOString();

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function neonSql() {
  if (getDatabaseBackend() !== 'neon') throw new ComplaintError('complaints_unavailable');
  assertApprovedNeonCutover();
  return createNeonSql();
}

let tablesConfirmed = false;

export async function complaintsAvailable() {
  if (tablesConfirmed) return true;
  if (getDatabaseBackend() !== 'neon') return false;
  try {
    const rows = await neonSql()`
      select to_regclass('private.customer_complaints') is not null
        and to_regclass('private.customer_complaint_resolutions') is not null
        and to_regclass('private.customer_complaint_email_deliveries') is not null as ready
    `;
    tablesConfirmed = rows[0]?.ready === true;
    return tablesConfirmed;
  } catch {
    return false;
  }
}

export async function submitComplaint(input: {
  userId: string;
  clientRequestId: string;
  customerName: string;
  contactEmail: string;
  subjectArea: ComplaintSubjectArea;
  description: string;
  requestedRemedy: ComplaintRemedy;
  remedyNote: string | null;
  locale: 'cs' | 'en';
}) {
  if (!(await complaintsAvailable())) throw new ComplaintError('complaints_unavailable');
  const sql = neonSql();

  const recent = await sql`
    select count(*)::int as n from private.customer_complaints
    where user_id = ${input.userId}::uuid and submitted_at > now() - interval '1 day'
      and client_request_id <> ${input.clientRequestId}::uuid
  `;
  if ((recent[0]?.n ?? 0) >= MAX_COMPLAINTS_PER_DAY) throw new ComplaintError('complaint_rate_limited');

  const profile = await sql`select active_plan_code from public.profiles where id = ${input.userId}::uuid`;
  const planContext = typeof profile[0]?.active_plan_code === 'string' ? profile[0].active_plan_code : null;
  const payloadSha256 = sha256({
    userId: input.userId,
    clientRequestId: input.clientRequestId,
    customerName: input.customerName,
    contactEmail: input.contactEmail,
    subjectArea: input.subjectArea,
    description: input.description,
    requestedRemedy: input.requestedRemedy,
    remedyNote: input.remedyNote,
    locale: input.locale,
    planContext,
  });

  // One statement: the receipt and its pending confirmation are created
  // atomically, and a retried submission returns the original receipt.
  const rows = await sql`
    with inserted as (
      insert into private.customer_complaints (
        user_id, resolution_due_at, locale, contact_email, customer_name, subject_area,
        description, requested_remedy, remedy_note, plan_context, payload_sha256, client_request_id
      ) values (
        ${input.userId}::uuid, now() + make_interval(days => ${COMPLAINT_RESOLUTION_DAYS}::int),
        ${input.locale}, ${input.contactEmail}, ${input.customerName}, ${input.subjectArea},
        ${input.description}, ${input.requestedRemedy}, ${input.remedyNote}, ${planContext},
        ${payloadSha256}, ${input.clientRequestId}::uuid
      )
      on conflict (user_id, client_request_id) do nothing
      returning id, submitted_at, resolution_due_at
    ), delivery as (
      insert into private.customer_complaint_email_deliveries (complaint_id, kind)
      select id, 'receipt' from inserted
      returning complaint_id
    )
    select id, submitted_at, resolution_due_at from inserted
    union all
    select c.id, c.submitted_at, c.resolution_due_at from private.customer_complaints c
    where c.user_id = ${input.userId}::uuid and c.client_request_id = ${input.clientRequestId}::uuid
      and not exists (select 1 from inserted)
  `;
  const row = rows[0];
  if (!row?.id) throw new ComplaintError('complaint_registration_failed');
  return { complaintId: String(row.id), submittedAt: iso(row.submitted_at), resolutionDueAt: iso(row.resolution_due_at) };
}

async function loadComplaint(complaintId: string) {
  const rows = await neonSql()`
    select c.*, r.resolved_at, r.outcome, r.remedy_applied, r.explanation, r.payload_sha256 as resolution_sha256
    from private.customer_complaints c
    left join private.customer_complaint_resolutions r on r.complaint_id = c.id
    where c.id = ${complaintId}::uuid
  `;
  return (rows[0] ?? null) as (ComplaintRow & ResolutionRow) | null;
}

function formatDate(value: string | Date, locale: 'cs' | 'en', withTime: boolean) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'long' as const } : {}),
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

function renderEmail(complaint: ComplaintRow & ResolutionRow, kind: DeliveryKind) {
  const locale = complaint.locale;
  const english = locale === 'en';
  const ui = (cs: string, en: string) => (english ? en : cs);
  const rows: Array<[string, string]> = [
    [ui('Číslo reklamace', 'Complaint ID'), complaint.id],
    [ui('Uplatněno', 'Submitted'), formatDate(complaint.submitted_at, locale, true)],
    [ui('Oblast', 'Area'), COMPLAINT_SUBJECT_AREAS[complaint.subject_area][locale]],
    [ui('Požadovaný způsob vyřízení', 'Requested remedy'), COMPLAINT_REMEDIES[complaint.requested_remedy][locale]
      + (complaint.remedy_note ? ` — ${complaint.remedy_note}` : '')],
  ];
  let subject: string;
  let heading: string;
  let intro: string;
  let body: string;

  if (kind === 'receipt') {
    subject = ui('Potvrzení přijetí reklamace Syllonaut', 'Confirmation of your Syllonaut complaint');
    heading = ui('Přijali jsme vaši reklamaci', 'We received your complaint');
    intro = ui(
      `Reklamaci vyřídíme bez zbytečného odkladu, nejpozději do ${formatDate(complaint.resolution_due_at, locale, false)} (${COMPLAINT_RESOLUTION_DAYS} dní od uplatnění). O vyřízení vám pošleme písemné potvrzení na tento e-mail.`,
      `We will resolve the complaint without undue delay and no later than ${formatDate(complaint.resolution_due_at, locale, false)} (${COMPLAINT_RESOLUTION_DAYS} days from submission). We will confirm the resolution in writing to this email address.`,
    );
    body = complaint.description;
  } else {
    if (!complaint.outcome || !complaint.resolved_at || !complaint.explanation) throw new ComplaintError('complaint_not_resolved');
    subject = ui('Vyřízení reklamace Syllonaut', 'Resolution of your Syllonaut complaint');
    heading = COMPLAINT_OUTCOMES[complaint.outcome][locale];
    intro = ui(
      `Vaši reklamaci jsme vyřídili ${formatDate(complaint.resolved_at, locale, true)}.`,
      `Your complaint was resolved on ${formatDate(complaint.resolved_at, locale, true)}.`,
    );
    if (complaint.remedy_applied) rows.push([ui('Způsob vyřízení', 'Remedy provided'), complaint.remedy_applied]);
    rows.push([ui('Výsledek', 'Outcome'), COMPLAINT_OUTCOMES[complaint.outcome][locale]]);
    body = complaint.explanation;
  }

  const bodyLabel = kind === 'receipt' ? ui('Obsah reklamace', 'Complaint content') : ui('Odůvodnění', 'Explanation');
  const hash = kind === 'receipt' ? complaint.payload_sha256 : complaint.resolution_sha256 ?? '';
  const contact = ui(
    `Dotazy: ${PROVIDER_CONTACT.email}, tel. ${PROVIDER_CONTACT.phoneDisplay}.`,
    `Questions: ${PROVIDER_CONTACT.email}, phone ${PROVIDER_CONTACT.phoneDisplay}.`,
  );
  const text = [
    heading, '', intro, '',
    ...rows.map(([label, value]) => `${label}: ${value}`), '',
    `${bodyLabel}:`, body, '',
    `${ui('Kontrolní hash', 'Evidence hash')}: ${hash}`,
    contact,
    `${PROVIDER_CONTACT.legalName}, ${ui('IČO', 'Business ID')} ${PROVIDER_CONTACT.businessId}`,
  ].join('\n');
  const html = `<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`
    + `<body lang="${locale}" dir="ltr" style="margin:0;background:#f4f3ef;color:#171821;font-family:Arial,Helvetica,sans-serif">`
    + `<main style="max-width:640px;margin:0 auto;padding:32px 20px"><section style="background:#fff;border:1px solid #dedde8;border-radius:16px;padding:28px">`
    + `<h1 style="margin:0 0 18px;font-size:26px">${escapeHtml(heading)}</h1><p style="line-height:1.6">${escapeHtml(intro)}</p>`
    + `<table role="presentation" style="width:100%;border-collapse:collapse;margin:22px 0">`
    + rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#62646d;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0">${escapeHtml(value)}</td></tr>`).join('')
    + `</table><h2 style="font-size:16px;margin:0 0 8px">${escapeHtml(bodyLabel)}</h2>`
    + `<p style="line-height:1.6;white-space:pre-wrap">${escapeHtml(body)}</p>`
    + `<p style="font-size:12px;line-height:1.5;color:#62646d">${escapeHtml(ui('Kontrolní hash', 'Evidence hash'))}: ${escapeHtml(hash)}<br>${escapeHtml(contact)}<br>${escapeHtml(PROVIDER_CONTACT.legalName)}, ${escapeHtml(ui('IČO', 'Business ID'))} ${escapeHtml(PROVIDER_CONTACT.businessId)}</p>`
    + `</section></main></body></html>`;
  return { subject, text, html };
}

export async function deliverComplaintEmail(complaintId: string, kind: DeliveryKind, ownerUserId?: string) {
  const sql = neonSql();
  const complaint = await loadComplaint(complaintId);
  if (!complaint || (ownerUserId && complaint.user_id !== ownerUserId)) throw new ComplaintError('complaint_not_found');

  const deliveries = await sql`
    select status, sent_at from private.customer_complaint_email_deliveries
    where complaint_id = ${complaintId}::uuid and kind = ${kind}
  `;
  const delivery = deliveries[0];
  if (!delivery) throw new ComplaintError('complaint_delivery_not_found');
  if (delivery.status === 'sent') return { sent: true as const, sentAt: iso(delivery.sent_at) };

  const email = renderEmail(complaint, kind);
  try {
    const resendId = await sendResendEmail({
      to: complaint.contact_email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: `syllonaut:complaint:${complaintId}:${kind}-v1`,
    });
    const updated = await sql`
      update private.customer_complaint_email_deliveries
      set status = 'sent', attempts = attempts + 1, resend_email_id = ${resendId}, last_error_code = null,
        sent_at = now(), updated_at = now()
      where complaint_id = ${complaintId}::uuid and kind = ${kind}
      returning sent_at
    `;
    if (kind === 'receipt') {
      // Operator copy; the customer's durable confirmation above is what counts.
      await sendResendEmail({
        to: PROVIDER_CONTACT.email,
        subject: `[Reklamace] ${complaint.id}`,
        text: email.text,
        html: email.html,
        idempotencyKey: `syllonaut:complaint:${complaintId}:receipt-operator-v1`,
      }).catch(() => undefined);
    }
    return { sent: true as const, sentAt: iso(updated[0]?.sent_at ?? new Date()) };
  } catch (cause) {
    const code = cause instanceof BillingEmailDeliveryError ? cause.code : 'complaint_email_failed';
    await sql`
      update private.customer_complaint_email_deliveries
      set status = 'failed', attempts = attempts + 1, last_error_code = ${code}, updated_at = now()
      where complaint_id = ${complaintId}::uuid and kind = ${kind} and status <> 'sent'
    `;
    throw new ComplaintError('complaint_email_failed');
  }
}

export async function resolveComplaint(input: {
  complaintId: string;
  adminUserId: string;
  outcome: ComplaintOutcome;
  remedyApplied: string | null;
  explanation: string;
}) {
  if (input.outcome !== 'rejected' && !input.remedyApplied) throw new ComplaintError('complaint_remedy_required');
  const sql = neonSql();
  const payloadSha256 = sha256({
    complaintId: input.complaintId,
    outcome: input.outcome,
    remedyApplied: input.remedyApplied,
    explanation: input.explanation,
    resolvedBy: input.adminUserId,
  });
  const rows = await sql`
    with inserted as (
      insert into private.customer_complaint_resolutions (
        complaint_id, outcome, remedy_applied, explanation, resolved_by, payload_sha256
      )
      select c.id, ${input.outcome}, ${input.remedyApplied}, ${input.explanation}, ${input.adminUserId}::uuid, ${payloadSha256}
      from private.customer_complaints c where c.id = ${input.complaintId}::uuid
      on conflict (complaint_id) do nothing
      returning complaint_id
    ), delivery as (
      insert into private.customer_complaint_email_deliveries (complaint_id, kind)
      select complaint_id, 'resolution' from inserted
      returning complaint_id
    )
    select complaint_id from inserted
  `;
  if (!rows[0]) {
    const exists = await sql`select 1 from private.customer_complaints where id = ${input.complaintId}::uuid`;
    throw new ComplaintError(exists.length ? 'complaint_already_resolved' : 'complaint_not_found');
  }
  return { complaintId: input.complaintId };
}

export type AdminComplaint = {
  id: string;
  submittedAt: string;
  resolutionDueAt: string;
  locale: 'cs' | 'en';
  customerName: string;
  contactEmail: string;
  subjectArea: ComplaintSubjectArea;
  description: string;
  requestedRemedy: ComplaintRemedy;
  remedyNote: string | null;
  planContext: string | null;
  resolvedAt: string | null;
  outcome: ComplaintOutcome | null;
  remedyApplied: string | null;
  explanation: string | null;
  receiptStatus: string | null;
  resolutionStatus: string | null;
};

export async function listComplaintsForAdmin(): Promise<AdminComplaint[]> {
  const rows = await neonSql()`
    select c.*, r.resolved_at, r.outcome, r.remedy_applied, r.explanation,
      dr.status as receipt_status, ds.status as resolution_status
    from private.customer_complaints c
    left join private.customer_complaint_resolutions r on r.complaint_id = c.id
    left join private.customer_complaint_email_deliveries dr on dr.complaint_id = c.id and dr.kind = 'receipt'
    left join private.customer_complaint_email_deliveries ds on ds.complaint_id = c.id and ds.kind = 'resolution'
    order by (r.complaint_id is not null), c.resolution_due_at asc
    limit 200
  `;
  return rows.map((row) => ({
    id: String(row.id),
    submittedAt: iso(row.submitted_at),
    resolutionDueAt: iso(row.resolution_due_at),
    locale: row.locale,
    customerName: row.customer_name,
    contactEmail: row.contact_email,
    subjectArea: row.subject_area,
    description: row.description,
    requestedRemedy: row.requested_remedy,
    remedyNote: row.remedy_note,
    planContext: row.plan_context,
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
    outcome: row.outcome,
    remedyApplied: row.remedy_applied,
    explanation: row.explanation,
    receiptStatus: row.receipt_status,
    resolutionStatus: row.resolution_status,
  }));
}

/** Cron: retry undelivered confirmations and remind the operator of deadlines. */
export async function runComplaintMaintenance() {
  if (!(await complaintsAvailable())) return { available: false as const };
  const sql = neonSql();
  const pending = await sql`
    select complaint_id, kind from private.customer_complaint_email_deliveries
    where status <> 'sent' and updated_at < now() - interval '10 minutes' and attempts < 10
    order by updated_at asc limit 50
  `;
  let retried = 0;
  let retryFailures = 0;
  for (const row of pending) {
    try {
      await deliverComplaintEmail(String(row.complaint_id), row.kind as DeliveryKind);
      retried += 1;
    } catch {
      retryFailures += 1;
    }
  }

  const due = await sql`
    select c.id, c.resolution_due_at from private.customer_complaints c
    where not exists (select 1 from private.customer_complaint_resolutions r where r.complaint_id = c.id)
      and c.resolution_due_at < now() + interval '7 days'
    order by c.resolution_due_at asc
  `;
  let reminderSent = false;
  if (due.length) {
    const lines = due.map((row) => `${row.id} — ${iso(row.resolution_due_at)}${new Date(row.resolution_due_at) < new Date() ? ' (PO TERMÍNU)' : ''}`);
    const text = `Nevyřízené reklamace s termínem do 7 dní nebo po termínu:\n\n${lines.join('\n')}\n\nVyřízení: https://www.syllonaut.com/admin/complaints`;
    await sendResendEmail({
      to: PROVIDER_CONTACT.email,
      subject: `[Reklamace] ${due.length} blížící se nebo prošlý termín`,
      text,
      html: `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
      idempotencyKey: `syllonaut:complaint-deadlines:${new Date().toISOString().slice(0, 10)}`,
    });
    reminderSent = true;
  }
  return { available: true as const, retried, retryFailures, dueCount: due.length, reminderSent };
}
