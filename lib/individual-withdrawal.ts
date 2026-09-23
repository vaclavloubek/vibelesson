import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { calculateWithdrawal } from '@/lib/withdrawal-calculation';
import {
  retrieveStripeSubscription, singleSubscriptionItem, subscriptionCustomerId,
  subscriptionLatestInvoiceId, subscriptionScheduleId,
} from '@/lib/stripe-subscription-management';
import {
  CheckoutEvidenceSchema, InvoiceEvidenceSchema, getWithdrawalCharge,
  stripeReference, withdrawalStripeRequest, cancelWithdrawnSubscription,
  createWithdrawalStripeRefund, findWithdrawalStripeRefund,
} from '@/lib/stripe-withdrawal';

const SnapshotSchema = z.object({
  snapshot_id: z.string().uuid(), plan_code: z.enum(['teacher','teacher_pro']),
  billing_period: z.enum(['monthly','annual']), amount_minor: z.number().int().positive().safe(),
  currency: z.enum(['czk','eur','usd']), immediate_performance_requested: z.boolean(),
  terms_acceptance_key: z.string(), contract_html: z.string(), withdrawal_form_html: z.string(),
  content_sha256: z.string(), accepted_at: z.string(), external_checkout_session_id: z.string(),
});
const RequestSchema = z.object({
  id: z.string().uuid(), status: z.enum(['processing','refund_pending','refund_succeeded','completed','needs_attention']),
  external_subscription_id: z.string(), external_payment_intent_id: z.string(),
  external_refund_id: z.string().nullable(), refund_status: z.string().nullable(),
  refund_amount_minor: z.number().int().nonnegative().safe(), prior_refunded_minor: z.number().int().nonnegative().safe(),
  subscription_cancelled_at: z.string().nullable(), first_attempt_at: z.string().nullable(),
  calculation_evidence: z.unknown().nullable(),
});
const StateSchema = z.object({
  receipt: z.object({
    id:z.string().uuid(),user_id:z.string().uuid(),snapshot_id:z.string().uuid(),
    withdrawal_sent_at:z.string(),withdrawal_received_at:z.string(),notice_sha256:z.string(),request_id:z.string().uuid().nullable(),
  }), request: RequestSchema.nullable(),
});
const ContextSchema = z.object({
  status:z.literal('ok'),
  snapshot:z.object({id:z.string().uuid(),planCode:z.string(),billingPeriod:z.string(),currency:z.string(),
    amountMinor:z.number(),immediatePerformanceRequested:z.boolean(),acceptedAt:z.string(),termsAcceptanceKey:z.string()}),
  payment:z.object({paymentIntentId:z.string(),amountPaid:z.number(),currency:z.string(),paidAt:z.string()}),
  priorRefundedMinor:z.number(),
});
const EvidenceSchema = z.object({
  methodVersion:z.literal('time-pro-rata-v1'),subscriptionId:z.string(),customerId:z.string(),invoiceId:z.string(),
  paymentIntentId:z.string(),chargeId:z.string(),priceId:z.string(),checkoutSessionId:z.string(),snapshotSha256:z.string(),
  termsAcceptanceKey:z.string(),activationEvidenceEventId:z.string(),contractConcludedAt:z.string(),
  amountMinor:z.number(),currency:z.enum(['czk','eur','usd']),periodStart:z.string(),periodEnd:z.string(),
  serviceStartedAt:z.string(),withdrawalReceivedAt:z.string(),immediatePerformanceRequested:z.boolean(),
  proportionateChargeDisclosed:z.boolean(),previouslyRefundedMinor:z.number(),refundDueMinor:z.number(),
});

async function rpc(name:string,params:Record<string,unknown>) {
  const {data,error}=await createPrivilegedRpcClient().rpc(name,params);
  if(error) throw new Error('withdrawal_evidence_operation_failed');
  return data;
}
export async function getWithdrawalState(id:string) {
  return StateSchema.parse(await rpc('get_individual_withdrawal_for_service',{p_receipt_id:id}));
}

/** Prepares immutable evidence. No cancellation or refund happens here. */
export async function prepareWithdrawal(id:string,key:string) {
  const state=await getWithdrawalState(id);
  if(state.request?.calculation_evidence) return state.request.calculation_evidence;
  const snapshots = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      return createNeonSql()`
        select * from public.get_individual_contract_snapshot_for_delivery(
          ${state.receipt.snapshot_id}::uuid,
          ${state.receipt.user_id}::uuid,
          ${true}::boolean
        )
      `;
    })()
    : await rpc('get_individual_contract_snapshot_for_delivery',{
      p_snapshot_id:state.receipt.snapshot_id,p_user_id:state.receipt.user_id,p_livemode:true,
    });
  const snapshot=SnapshotSchema.parse(snapshots?.[0]);
  const snapshotHash=createHash('sha256').update(snapshot.contract_html,'utf8')
    .update('\n--syllonaut-withdrawal-form--\n','utf8').update(snapshot.withdrawal_form_html,'utf8').digest('hex');
  if(snapshotHash!==snapshot.content_sha256) throw new Error('withdrawal_snapshot_integrity_failed');
  const session=await withdrawalStripeRequest(key,'checkout/sessions/'+encodeURIComponent(snapshot.external_checkout_session_id),CheckoutEvidenceSchema);
  if(session.id!==snapshot.external_checkout_session_id || session.metadata.syllonaut_user_id!==state.receipt.user_id
    || session.metadata.syllonaut_contract_snapshot_id!==state.receipt.snapshot_id) throw new Error('withdrawal_contract_mismatch');
  const subscriptionId=stripeReference(session.subscription),customerId=stripeReference(session.customer),invoiceId=stripeReference(session.invoice);
  const context=ContextSchema.parse(await rpc('get_individual_withdrawal_context_for_service',{
    p_user_id:state.receipt.user_id,p_subscription_id:subscriptionId,p_snapshot_id:state.receipt.snapshot_id,
  }));
  const subscription=await retrieveStripeSubscription(key,subscriptionId);
  const item=singleSubscriptionItem(subscription);
  // A later upgrade/proration, renewal, schedule or pending update requires an
  // allocation review. Never substitute the current tariff for this contract.
  if(subscriptionCustomerId(subscription)!==customerId || subscription.metadata?.syllonaut_user_id!==state.receipt.user_id
    || subscription.metadata?.syllonaut_contract_snapshot_id!==state.receipt.snapshot_id
    || subscriptionLatestInvoiceId(subscription)!==invoiceId || subscription.pending_update || subscriptionScheduleId(subscription)
    || subscription.metadata?.syllonaut_plan_code!==snapshot.plan_code
    || subscription.metadata?.syllonaut_billing_period!==snapshot.billing_period) throw new Error('withdrawal_plan_history_review_required');
  const invoice=await withdrawalStripeRequest(key,'invoices/'+encodeURIComponent(invoiceId),InvoiceEvidenceSchema);
  const charge=await getWithdrawalCharge(key,context.payment.paymentIntentId);
  if(invoice.id!==invoiceId || stripeReference(invoice.customer)!==customerId || stripeReference(charge.customer)!==customerId
    || stripeReference(charge.payment_intent)!==context.payment.paymentIntentId
    || invoice.amount_paid!==snapshot.amount_minor || context.payment.amountPaid!==snapshot.amount_minor
    || charge.amount!==snapshot.amount_minor || invoice.currency!==snapshot.currency || charge.currency!==snapshot.currency
    || context.payment.currency!==snapshot.currency || charge.amount_refunded!==context.priorRefundedMinor) {
    throw new Error('withdrawal_price_review_required');
  }
  const period=invoice.lines.data[0].period;
  if(period.start!==item.current_period_start || period.end!==item.current_period_end) throw new Error('withdrawal_period_review_required');
  const {data:activation,error:activationError} = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select created_at, external_event_id
        from public.billing_email_deliveries
        where user_id = ${state.receipt.user_id}::uuid
          and external_subscription_id = ${subscriptionId}
          and contract_snapshot_id = ${state.receipt.snapshot_id}::uuid
          and livemode = true
          and notification_type = 'subscription_activated'
        order by created_at asc
        limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('billing_email_deliveries')
      .select('created_at, external_event_id').eq('user_id',state.receipt.user_id).eq('external_subscription_id',subscriptionId)
      .eq('contract_snapshot_id',state.receipt.snapshot_id).eq('livemode',true).eq('notification_type','subscription_activated')
      .order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(activationError || !activation) throw new Error('withdrawal_activation_evidence_required');
  const iso=(seconds:number)=>new Date(seconds*1000).toISOString();
  const serviceStartedAt=Math.max(period.start,invoice.status_transitions.paid_at,Date.parse(activation.created_at)/1000);
  const contractConcludedAt=iso(invoice.status_transitions.paid_at);
  const calculation=calculateWithdrawal({amountMinor:snapshot.amount_minor,currency:snapshot.currency,
    periodStart:iso(period.start),periodEnd:iso(period.end),serviceStartedAt:iso(serviceStartedAt),
    withdrawalReceivedAt:new Date(state.receipt.withdrawal_received_at).toISOString(),
    immediatePerformanceRequested:snapshot.immediate_performance_requested,
    proportionateChargeDisclosed:['2026-09-21-v1','2026-09-21-v2','2026-09-21-v3'].includes(snapshot.terms_acceptance_key),
    previouslyRefundedMinor:charge.amount_refunded});
  const evidence={...calculation,subscriptionId,customerId,invoiceId,paymentIntentId:context.payment.paymentIntentId,
    chargeId:charge.id,priceId:item.price!.id!,checkoutSessionId:session.id,snapshotSha256:snapshotHash,
    termsAcceptanceKey:snapshot.terms_acceptance_key,activationEvidenceEventId:activation.external_event_id,contractConcludedAt};
  const request=RequestSchema.parse(await rpc('reserve_individual_withdrawal_v2_for_service',{
    p_receipt_id:id,p_subscription_id:subscriptionId,p_contract_concluded_at:contractConcludedAt,
    p_service_period_start:evidence.periodStart,p_service_started_at:evidence.serviceStartedAt,p_service_period_end:evidence.periodEnd,
    p_retained_amount_minor:evidence.retainedMinor,p_target_total_refund_minor:evidence.totalRefundEntitlementMinor,
    p_refund_amount_minor:evidence.refundDueMinor,p_checkout_session_id:session.id,p_invoice_id:invoiceId,p_charge_id:charge.id,
    p_snapshot_sha256:snapshotHash,p_terms_acceptance_key:snapshot.terms_acceptance_key,
    p_activation_evidence_event_id:activation.external_event_id,p_calculation_evidence:evidence,
  }));
  return request.calculation_evidence;
}

async function fail(requestId:string,token:string,stage:'refund'|'cancellation'|'finalize',error:unknown) {
  await rpc('fail_individual_withdrawal_execution_for_service',{p_request_id:requestId,p_lease_token:token,
    p_failure_stage:stage,p_failure_code:error instanceof Error ? error.message : 'unknown'}).catch(()=>null);
}

export async function executeWithdrawal(id:string,key:string) {
  const state=await getWithdrawalState(id);
  const request=state.request;
  if(!request) throw new Error('withdrawal_not_prepared');
  if(request.status==='completed') return request;
  const evidence=EvidenceSchema.parse(request.calculation_evidence);
  if(calculateWithdrawal(evidence).refundDueMinor!==evidence.refundDueMinor) throw new Error('withdrawal_calculation_invalid');
  const token=await rpc('claim_individual_withdrawal_for_service',{p_request_id:request.id});
  if(typeof token!=='string') throw new Error('withdrawal_busy_or_retry_window_expired');
  let subscription;
  try {
    subscription=await retrieveStripeSubscription(key,evidence.subscriptionId);
    if(subscriptionCustomerId(subscription)!==evidence.customerId || subscriptionLatestInvoiceId(subscription)!==evidence.invoiceId
      || subscription.pending_update || subscriptionScheduleId(subscription)
      || singleSubscriptionItem(subscription).price?.id!==evidence.priceId) throw new Error('withdrawal_plan_history_review_required');
  } catch(error) { await fail(request.id,token,'finalize',error); throw error; }
  let refund=await findWithdrawalStripeRefund(key,request.id,evidence.paymentIntentId);
  try {
    const charge=await getWithdrawalCharge(key,evidence.paymentIntentId);
    if(charge.id!==evidence.chargeId || charge.amount!==evidence.amountMinor || charge.currency!==evidence.currency) throw new Error('withdrawal_charge_changed');
    if(refund && (refund.amount!==evidence.refundDueMinor || refund.currency!==evidence.currency
      || stripeReference(refund.payment_intent)!==evidence.paymentIntentId)) throw new Error('withdrawal_existing_refund_mismatch');
    if(!refund && charge.amount_refunded!==evidence.previouslyRefundedMinor) throw new Error('withdrawal_external_refund_review_required');
    if(!refund && evidence.refundDueMinor>0) refund=await createWithdrawalStripeRefund(key,{
      requestId:request.id,receiptId:id,paymentIntentId:evidence.paymentIntentId,amountMinor:evidence.refundDueMinor,currency:evidence.currency,
    });
    if(refund) await rpc('reconcile_individual_withdrawal_refund_for_service',{
      p_request_id:request.id,p_lease_token:token,p_refund_id:refund.id,p_payment_intent_id:evidence.paymentIntentId,
      p_amount:refund.amount,p_currency:refund.currency,p_status:refund.status,
    });
  } catch(error) { await fail(request.id,token,'refund',error); throw error; }
  try {
    const canceledAt=subscription.status==='canceled'
      ? new Date((subscription.canceled_at ?? Math.floor(Date.now()/1000))*1000).toISOString()
      : (await cancelWithdrawnSubscription(key,evidence.subscriptionId)).canceledAt;
    await rpc('record_individual_withdrawal_cancellation_for_service',{
      p_request_id:request.id,p_lease_token:token,p_cancelled_at:canceledAt,
    });
  } catch(error) { await fail(request.id,token,'cancellation',error); throw error; }
  return (await getWithdrawalState(id)).request;
}
