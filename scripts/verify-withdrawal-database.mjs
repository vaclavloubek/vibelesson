// Run with a locally installed @electric-sql/pglite module path; no remote DB is used.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2] ?? '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth;
create table auth.users(id uuid primary key);
create table public.billing_email_deliveries(id uuid);
create table private.stripe_subscription_payments(user_id uuid,livemode boolean);
`);
for(const file of ['20260921045117_add_individual_contract_snapshots.sql','20260921045911_atomically_link_individual_contract_snapshot.sql','20260921081333_add_withdrawal_refund_evidence.sql','20260921082127_update_terms_1_2_legal_008.sql']) {
  // Terms SQL functions need their referenced table before creation.
  if(file.includes('update_terms')) await db.exec(`create table private.terms_acceptance_events(user_id uuid,acceptance_key text,source text,terms_version text,accepted_at timestamptz default now(),unique(user_id,acceptance_key,source));`);
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
}
const user='11111111-1111-4111-8111-111111111111', snapshot='22222222-2222-4222-8222-222222222222', actor='5bbed66a-c125-4740-947c-946a364c6d3f';
await db.query(`insert into private.individual_contract_snapshots(id,user_id,provider,livemode,plan_code,billing_period,currency,amount_minor,terms_version,terms_acceptance_key,locale,immediate_performance_requested,contract_html,withdrawal_form_html,content_sha256,accepted_at)
values($1,$2,'stripe',true,'teacher','monthly','czk',19900,'1.2','2026-09-21-v3','cs',true,repeat('a',1001),repeat('b',301),repeat('c',64),'2026-01-01')`,[snapshot,user]);
const params=[user,snapshot,'2026-01-02T00:00:00Z','a'.repeat(64),actor];
const register=`select public.register_individual_withdrawal_for_service($1,$2,$3,$4,$5) as id`;
const {rows:[{id}]}=await db.query(register,params);
assert.equal((await db.query(register,params)).rows[0].id,id);
await assert.rejects(db.query(register,[user,snapshot,'2026-01-03T00:00:00Z','a'.repeat(64),actor]),/receipt_conflict/);
await assert.rejects(db.query(register,[user,snapshot,params[2],params[3],user]),/superadmin_required/);
await assert.rejects(db.query(`update private.individual_withdrawals set received_at=now() where id=$1`,[id]),/append-only/);
await db.query('select public.prepare_individual_withdrawal_for_service($1,$2)',[id,{refundDueMinor:100}]);
await assert.rejects(db.query('select public.prepare_individual_withdrawal_for_service($1,$2)',[id,{refundDueMinor:200}]),/calculation_conflict/);
const claim='select public.claim_individual_withdrawal_for_service($1) as token';
const token=(await db.query(claim,[id])).rows[0].token;
assert.ok(token);assert.equal((await db.query(claim,[id])).rows[0].token,null);
await assert.rejects(db.query('select public.finish_individual_withdrawal_for_service($1,$2,$3,$4,$5)',[id,user,'re_fixture','succeeded',null]),/lease_conflict/);
await db.query('select public.finish_individual_withdrawal_for_service($1,$2,$3,$4,$5)',[id,token,'re_fixture','succeeded',null]);
assert.equal((await db.query(claim,[id])).rows[0].token,null);
const privileges=await db.query(`select p.oid::regprocedure::text as fn,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%withdrawal%for_service'`);
assert.equal(privileges.rows.length,6);for(const row of privileges.rows){assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);}
const tables=await db.query(`select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and relname in ('individual_withdrawals','individual_withdrawal_calculations','individual_withdrawal_execution')`);
assert.equal(tables.rows.length,3);for(const row of tables.rows)assert.equal(row.relrowsecurity,true);
await db.query('insert into auth.users values($1)',[user]);
for(const key of ['2026-09-21-v1','2026-09-21-v2','2026-09-21-v3']) {
 await db.query('select public.record_terms_reconsent_for_service($1,$2)',[user,key]);
 assert.equal((await db.query('select public.has_terms_acceptance_for_service($1,$2) as accepted',[user,key])).rows[0].accepted,true);
}
await assert.rejects(db.query('select public.record_terms_reconsent_for_service($1,$2)',[user,'unsupported']),/unsupported_terms/);
await db.close();console.log('Local PostgreSQL: immutable evidence, idempotent receipt, claim exclusion, service-only grants, RLS and Terms v1/v2/v3 verified.');
