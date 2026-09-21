import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const nativeRequire = createRequire(import.meta.url);
let mocks = {};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const require = name => mocks[name] ?? (name.startsWith('@/') ? load(name.slice(2)+'.ts') : nativeRequire(name));
  new Function('require','exports',code)(require,exports);
  return exports;
}
const userId='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const snapshotId='33333333-3333-4333-8333-333333333333';
let state, snapshot, subscription, charge, existing, submitted, canceled, finish;
const start=Date.parse('2026-10-01T00:00:00Z')/1000;
const end=Date.parse('2026-11-01T00:00:00Z')/1000;
function reset() {
  submitted=0;canceled=0;existing=null;finish=null;
  snapshot={snapshot_id:snapshotId,plan_code:'teacher',billing_period:'monthly',amount_minor:19900,currency:'czk',immediate_performance_requested:true,terms_acceptance_key:'2026-09-21-v3',contract_html:'contract',withdrawal_form_html:'form',external_checkout_session_id:'cs_live_fixture'};
  snapshot.content_sha256=createHash('sha256').update('contract\n--syllonaut-withdrawal-form--\nform').digest('hex');
  state={receipt:{id,user_id:userId,snapshot_id:snapshotId,received_at:'2026-10-06T00:00:00Z'},execution:{status:'received',first_attempt_at:null,stripe_refund_id:null,stripe_refund_status:null},calculation:null,payments:[{external_payment_intent_id:'pi_fixture',external_invoice_id:'in_fixture',external_subscription_id:'sub_fixture',amount_paid:19900,currency:'czk',billing_reason:'subscription_create'}]};
  subscription={id:'sub_fixture',customer:'cus_fixture',status:'active',latest_invoice:'in_fixture',metadata:{syllonaut_user_id:userId,syllonaut_contract_snapshot_id:snapshotId,syllonaut_plan_code:'teacher',syllonaut_billing_period:'monthly'},items:{data:[{id:'si_fixture',price:{id:'price_fixture'},current_period_start:start,current_period_end:end}]}};
  charge={id:'ch_fixture',amount:19900,amount_refunded:0,currency:'czk',customer:'cus_fixture',payment_intent:'pi_fixture'};
}
const chain = {select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},async maybeSingle(){return {data:{created_at:'2026-10-01T00:00:00Z',external_event_id:'evt_activation'}};}};
mocks['@/lib/supabase/admin']={createAdminClient:()=>({from:()=>chain,rpc:async(name,args)=>{
  if(name==='get_individual_withdrawal_for_service') return {data:structuredClone(state)};
  if(name==='get_individual_contract_snapshot_for_delivery') return {data:[snapshot]};
  if(name==='prepare_individual_withdrawal_for_service') {state.calculation=args.p_evidence;state.execution.status='prepared';return {data:null};}
  if(name==='claim_individual_withdrawal_for_service') return {data:'lease'};
  if(name==='finish_individual_withdrawal_for_service') {finish=args;state.execution.status=args.p_review_reason?'manual_review':'submitted';return {data:null};}
  throw new Error(name);
}})};
mocks['@/lib/stripe-subscription-management']={retrieveStripeSubscription:async()=>subscription,singleSubscriptionItem:s=>s.items.data[0],subscriptionCustomerId:s=>s.customer,subscriptionLatestInvoiceId:s=>s.latest_invoice,subscriptionScheduleId:s=>s.schedule??null};
mocks['@/lib/stripe-withdrawal']={stripeReference:v=>typeof v==='string'?v:v.id,getWithdrawalCharge:async()=>charge,findWithdrawalStripeRefund:async()=>existing,cancelWithdrawnSubscription:async()=>{canceled++;subscription.status='canceled';},createWithdrawalStripeRefund:async(_key,args)=>{submitted++;return {id:'re_fixture',status:'succeeded',amount:args.amountMinor,currency:args.currency,payment_intent:args.paymentIntentId};},withdrawalStripeRequest:async(_key,path)=>path.startsWith('checkout/')?{id:'cs_live_fixture',customer:'cus_fixture',subscription:'sub_fixture',invoice:'in_fixture',metadata:{syllonaut_user_id:userId,syllonaut_contract_snapshot_id:snapshotId}}:{id:'in_fixture',customer:'cus_fixture',amount_paid:19900,currency:'czk',status_transitions:{paid_at:start},lines:{data:[{period:{start,end}}]}}};
const {prepareWithdrawal,executeWithdrawal}=load('lib/individual-withdrawal.ts');
reset();const calculation=await prepareWithdrawal(id,'key');assert.equal(calculation.refundDueMinor,16691);assert.equal(submitted,0);assert.equal(canceled,0);
await executeWithdrawal(id,'key');assert.equal(submitted,1);assert.equal(canceled,1);assert.equal(finish.p_refund_id,'re_fixture');
await executeWithdrawal(id,'key');assert.equal(submitted,1);
for(const mutation of [
  ()=>subscription.latest_invoice='in_upgrade',
  ()=>subscription.metadata.syllonaut_plan_code='teacher_pro',
  ()=>subscription.schedule='sub_sched_fixture',
  ()=>subscription.pending_update={},
  ()=>state.payments.push({...state.payments[0],external_payment_intent_id:'pi_upgrade'}),
  ()=>charge.amount=29900,
  ()=>charge.customer='cus_other',
  ()=>snapshot.content_sha256='broken',
]) {reset();mutation();await assert.rejects(prepareWithdrawal(id,'key'));assert.equal(submitted,0);assert.equal(canceled,0);}
reset();await prepareWithdrawal(id,'key');subscription.latest_invoice='in_upgrade';await assert.rejects(executeWithdrawal(id,'key'));assert.equal(submitted,0);assert.equal(canceled,0);
reset();await prepareWithdrawal(id,'key');charge.amount_refunded=100;await assert.rejects(executeWithdrawal(id,'key'));assert.equal(submitted,0);assert.equal(finish.p_review_reason,'external_refund_changed');
reset();await prepareWithdrawal(id,'key');state.execution.first_attempt_at='2026-10-06T01:00:00Z';charge.amount_refunded=16691;existing={id:'re_fixture',status:'succeeded',amount:16691,currency:'czk',payment_intent:'pi_fixture'};await executeWithdrawal(id,'key');assert.equal(submitted,0);assert.equal(finish.p_refund_id,'re_fixture');
reset();await prepareWithdrawal(id,'key');state.calculation.refundDueMinor++;await assert.rejects(executeWithdrawal(id,'key'));assert.equal(submitted,0);
const sql=fs.readFileSync('supabase/migrations/20260921081333_add_withdrawal_refund_evidence.sql','utf8');
assert.ok(sql.includes("interval '23 hours'"));assert.ok(sql.includes("lease_until < now()"));assert.ok(sql.includes('from public,anon,authenticated'));
const route=fs.readFileSync('app/api/admin/withdrawals/route.ts','utf8');assert.ok(route.includes('isSuperadminUserId(userId)'));assert.ok(route.includes('same_origin_required'));
console.log('Withdrawal workflow: original-contract binding, plan-change review, prior refunds, retry recovery and no duplicate refund passed.');
