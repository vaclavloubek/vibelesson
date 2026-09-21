// Run with a locally installed @electric-sql/pglite module path; no remote DB is used.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.argv[2] ?? '@electric-sql/pglite');
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema private; create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
  create table public.profiles(id uuid primary key, marketing_email_consent boolean,
    marketing_email_consent_at timestamptz, marketing_email_consent_version text, ui_locale text);
  create table public.billing_email_deliveries(id uuid primary key default gen_random_uuid());
  create table private.marketing_consent_events(user_id uuid, granted boolean, consent_version text, source text);
  create table private.terms_acceptance_events(
    user_id uuid, acceptance_key text, source text, terms_version text,
    accepted_at timestamptz default now(), unique(user_id,acceptance_key,source));
  create table private.stripe_subscription_payments(
    provider text not null default 'stripe', livemode boolean not null,
    external_payment_intent_id text not null, external_invoice_id text not null,
    user_id uuid not null references auth.users(id), external_subscription_id text not null,
    paid_at timestamptz not null, amount_paid bigint not null, currency text not null,
    billing_reason text not null, created_at timestamptz default now(), updated_at timestamptz default now(),
    primary key(provider,livemode,external_payment_intent_id));
  create table private.individual_billing_refunds(
    provider text not null default 'stripe', livemode boolean not null, external_charge_id text not null,
    external_payment_intent_id text not null, user_id uuid not null references auth.users(id),
    external_subscription_id text not null, amount_total bigint not null, amount_refunded bigint not null,
    primary key(provider,livemode,external_charge_id));
`);

for (const file of [
  '20260921045117_add_individual_contract_snapshots.sql',
  '20260921045911_atomically_link_individual_contract_snapshot.sql',
  '20260921074647_add_individual_prorata_withdrawal_workflow.sql',
  '20260921074715_index_individual_withdrawal_snapshot_fk.sql',
  '20260921081333_add_withdrawal_refund_evidence.sql',
  '20260921082127_update_terms_1_2_legal_008.sql',
]) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));

const user = '11111111-1111-4111-8111-111111111111';
const snapshot = '22222222-2222-4222-8222-222222222222';
const actor = '5bbed66a-c125-4740-947c-946a364c6d3f';
await db.query('insert into auth.users(id) values($1)', [user]);
await db.query(`insert into private.individual_contract_snapshots(
  id,user_id,provider,livemode,plan_code,billing_period,currency,amount_minor,terms_version,
  terms_acceptance_key,locale,immediate_performance_requested,contract_html,withdrawal_form_html,
  content_sha256,accepted_at)
  values($1,$2,'stripe',true,'teacher','monthly','czk',19900,'1.2','2026-09-21-v3','cs',true,
  repeat('a',1001),repeat('b',301),repeat('c',64),'2026-01-01T00:00:00Z')`, [snapshot, user]);
await db.query(`insert into private.stripe_subscription_payments(
  provider,livemode,external_payment_intent_id,external_invoice_id,user_id,external_subscription_id,
  paid_at,amount_paid,currency,billing_reason)
  values('stripe',true,'pi_fixture','in_fixture',$1,'sub_fixture','2026-01-01',19900,'czk','subscription_create')`, [user]);

const sent = '2026-01-14T23:59:00Z';
const received = '2026-01-16T00:00:00Z';
const notice = 'd'.repeat(64);
const register = `select public.register_individual_withdrawal_receipt_for_service($1,$2,$3,$4,$5,$6) as id`;
const { rows: [{ id: receiptId }] } = await db.query(register, [user,snapshot,sent,received,notice,actor]);
assert.equal((await db.query(register,[user,snapshot,sent,received,notice,actor])).rows[0].id, receiptId);
await assert.rejects(db.query(register,[user,snapshot,sent,'2026-01-17',notice,actor]), /receipt_conflict/);
await assert.rejects(db.query(register,[user,snapshot,sent,received,notice,user]), /superadmin_required/);
await assert.rejects(db.query('update private.individual_withdrawal_receipts set withdrawal_received_at=now() where id=$1',[receiptId]), /immutable/);

const evidence = {
  methodVersion:'time-pro-rata-v1', amountMinor:19900, retainedMinor:9630,
  totalRefundEntitlementMinor:10270, refundDueMinor:10270,
  withdrawalReceivedAt:received, aiUsageExcluded:true,
};
const reserve = `select public.reserve_individual_withdrawal_v2_for_service(
  $1,'sub_fixture','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',
  '2026-02-01T00:00:00Z',9630,10270,10270,'cs_live_fixture','in_fixture','ch_fixture',
  $2,'2026-09-21-v3','evt_activation',$3::jsonb) as request`;
const request = (await db.query(reserve,[receiptId,'c'.repeat(64),JSON.stringify(evidence)])).rows[0].request;
assert.equal(new Date(request.withdrawal_sent_at).toISOString(), new Date(sent).toISOString());
assert.equal(new Date(request.withdrawal_received_at).toISOString(), new Date(received).toISOString());
assert.equal(request.refund_amount_minor, 10270);
assert.deepEqual(request.calculation_evidence, evidence);
assert.equal((await db.query(reserve,[receiptId,'c'.repeat(64),JSON.stringify(evidence)])).rows[0].request.id, request.id);
assert.equal(new Date(request.withdrawal_deadline).toISOString(), '2026-01-15T00:00:00.000Z');
await assert.rejects(db.query('update private.individual_withdrawal_requests set refund_amount_minor=1 where id=$1',[request.id]), /immutable/);

const lateSnapshot = '33333333-3333-4333-8333-333333333333';
await db.query(`insert into private.individual_contract_snapshots
  select $1,user_id,provider,livemode,plan_code,billing_period,currency,amount_minor,terms_version,
  terms_acceptance_key,locale,immediate_performance_requested,contract_html,withdrawal_form_html,
  content_sha256,accepted_at,created_at from private.individual_contract_snapshots where id=$2`,[lateSnapshot,snapshot]);
const lateReceipt = (await db.query(register,[user,lateSnapshot,'2026-01-16','2026-01-16',notice,actor])).rows[0].id;
await assert.rejects(db.query(reserve,[lateReceipt,'c'.repeat(64),JSON.stringify(evidence)]),/invalid_individual_withdrawal_reservation/);

const claim = 'select public.claim_individual_withdrawal_for_service($1) as token';
const token = (await db.query(claim,[request.id])).rows[0].token;
assert.ok(token);
assert.equal((await db.query(claim,[request.id])).rows[0].token, null);
await assert.rejects(db.query(
  `select public.reconcile_individual_withdrawal_refund_for_service($1,$2,'re_fixture','pi_fixture',10270,'czk','succeeded')`,
  [request.id,user]), /mismatch/);
await db.query(
  `select public.reconcile_individual_withdrawal_refund_for_service($1,$2,'re_fixture','pi_fixture',10270,'czk','succeeded')`,
  [request.id,token]);
await db.query(
  `select public.record_individual_withdrawal_cancellation_for_service($1,$2,'2026-01-16T01:00:00Z')`,
  [request.id,token]);
const complete = (await db.query('select status,refund_status,subscription_cancelled_at from private.individual_withdrawal_requests where id=$1',[request.id])).rows[0];
assert.equal(complete.status,'completed');
assert.equal(complete.refund_status,'succeeded');

const privileges = await db.query(`select p.oid::regprocedure::text as fn,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%withdrawal%for_service'`);
assert.equal(privileges.rows.length,12);
for (const row of privileges.rows) {
  assert.equal(row.anon,false,row.fn); assert.equal(row.authenticated,false,row.fn);
  const superseded = /^(reserve_individual_withdrawal_for_service|record_individual_withdrawal_refund_for_service|complete_individual_withdrawal_for_service|fail_individual_withdrawal_for_service)\(/.test(row.fn);
  assert.equal(row.service,!superseded,row.fn);
}
const tables = await db.query(`select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and relname in ('individual_withdrawal_requests','individual_withdrawal_receipts')`);
assert.equal(tables.rows.length,2);
for (const row of tables.rows) assert.equal(row.relrowsecurity,true,row.relname);

for (const key of ['2026-09-21-v1','2026-09-21-v2','2026-09-21-v3']) {
  await db.query('select public.record_terms_reconsent_for_service($1,$2)',[user,key]);
  assert.equal((await db.query('select public.has_terms_acceptance_for_service($1,$2) as accepted',[user,key])).rows[0].accepted,true);
}
await assert.rejects(db.query('select public.record_terms_reconsent_for_service($1,$2)',[user,'unsupported']),/unsupported_terms/);
await db.close();
console.log('Local PostgreSQL: sent-at eligibility, immutable evidence, execution lease, service-only grants, RLS and Terms v1/v2/v3 passed.');
