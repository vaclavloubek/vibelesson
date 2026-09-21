import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnusedServiceChangeRefund } from '@/lib/service-change-policy';
import {
  retrieveStripeSubscription,
  singleSubscriptionItem,
  subscriptionLatestInvoiceId,
} from '@/lib/stripe-subscription-management';
import {
  cancelWithdrawnSubscription,
  createServiceChangeStripeRefund,
  findServiceChangeStripeRefund,
  getWithdrawalCharge,
  stripeReference,
  withdrawalStripeRequest,
} from '@/lib/stripe-withdrawal';

const RequestState = z.object({
  request: z.object({
    id: z.string().uuid(),
    release_id: z.string().uuid(),
    user_id: z.string().uuid(),
    external_subscription_id: z.string(),
    requested_at: z.string(),
    status: z.string(),
    calculation_evidence: z.unknown().nullable(),
    external_payment_intent_id: z.string().nullable(),
    refund_amount_minor: z.number().int().nonnegative().nullable(),
    currency: z.enum(['czk','eur','usd']).nullable(),
    subscription_cancelled_at: z.string().nullable(),
  }),
  delivery: z.object({ subject_id: z.string().uuid(), external_subscription_id: z.string() }),
  release: z.object({ id: z.string().uuid(), strategy: z.literal('durable_notice'), classification: z.literal('material_adverse') }),
});

const Invoice = z.object({
  id: z.string().regex(/^in_[A-Za-z0-9_]+$/),
  object: z.literal('invoice'),
  livemode: z.literal(true),
  status: z.literal('paid'),
  payment_intent: z.union([z.string(), z.object({ id: z.string() })]),
  amount_paid: z.number().int().nonnegative().safe(),
  currency: z.enum(['czk','eur','usd']),
});

async function state(id: string) {
  const {data,error}=await createAdminClient().rpc('get_service_change_termination_for_service',{p_request_id:id});
  if(error || !data) throw new Error('service_change_termination_lookup_failed');
  return RequestState.parse(data);
}

async function fail(id: string, token: string, stage: 'refund'|'cancellation'|'finalize', error: unknown) {
  const code=error instanceof Error ? error.message : 'service_change_termination_failed';
  await createAdminClient().rpc('fail_service_change_termination_for_service',{
    p_request_id:id,p_lease_token:token,p_failure_stage:stage,p_failure_code:code,
  });
}

export async function prepareServiceChangeTermination(id: string, key: string) {
  const current=await state(id);
  const request=current.request;
  if(request.user_id!==current.delivery.subject_id || request.external_subscription_id!==current.delivery.external_subscription_id
    || request.release_id!==current.release.id) throw new Error('service_change_termination_contract_mismatch');
  if(request.calculation_evidence) return current;

  const subscription=await retrieveStripeSubscription(key,request.external_subscription_id);
  if(subscription.id!==request.external_subscription_id || !['trialing','active','past_due'].includes(subscription.status??'')) {
    throw new Error('service_change_subscription_state_review_required');
  }
  if(subscription.pending_update || subscription.schedule) throw new Error('service_change_subscription_history_review_required');
  const item=singleSubscriptionItem(subscription);
  if(!item.current_period_start || !item.current_period_end) throw new Error('service_change_subscription_period_missing');
  const invoiceId=subscriptionLatestInvoiceId(subscription);
  if(!invoiceId) throw new Error('service_change_invoice_missing');
  const invoice=await withdrawalStripeRequest(key,'invoices/'+encodeURIComponent(invoiceId),Invoice);
  const paymentIntentId=stripeReference(invoice.payment_intent);
  if(!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) throw new Error('service_change_payment_intent_invalid');
  const charge=await getWithdrawalCharge(key,paymentIntentId);
  if(charge.amount!==invoice.amount_paid || charge.currency!==invoice.currency) throw new Error('service_change_charge_mismatch');

  const periodStart=new Date(item.current_period_start*1000).toISOString();
  const periodEnd=new Date(item.current_period_end*1000).toISOString();
  const calculation=calculateUnusedServiceChangeRefund({
    amountMinor:invoice.amount_paid,periodStart,periodEnd,terminatedAt:request.requested_at,
    previouslyRefundedMinor:charge.amount_refunded,
  });
  const evidence={
    methodVersion:calculation.methodVersion,periodStart,periodEnd,terminatedAt:request.requested_at,
    paymentAmountMinor:invoice.amount_paid,priorRefundedMinor:charge.amount_refunded,
    retainedMinor:calculation.retainedMinor,totalRefundEntitlementMinor:calculation.totalRefundEntitlementMinor,
    refundDueMinor:calculation.refundDueMinor,rounding:calculation.rounding,
  };
  const {error}=await createAdminClient().rpc('reserve_service_change_termination_refund_for_service',{
    p_request_id:id,p_invoice_id:invoice.id,p_payment_intent_id:paymentIntentId,p_charge_id:charge.id,
    p_currency:invoice.currency,p_payment_amount_minor:invoice.amount_paid,p_prior_refunded_minor:charge.amount_refunded,
    p_retained_amount_minor:calculation.retainedMinor,p_target_total_refund_minor:calculation.totalRefundEntitlementMinor,
    p_refund_amount_minor:calculation.refundDueMinor,p_period_start:periodStart,p_period_end:periodEnd,
    p_calculation_evidence:evidence,
  });
  if(error) throw new Error('service_change_termination_reservation_failed');
  return state(id);
}

export async function executeServiceChangeTermination(id: string, key: string) {
  let current=await prepareServiceChangeTermination(id,key);
  if(current.request.status==='completed') return current;
  const {data:token,error:claimError}=await createAdminClient().rpc('claim_service_change_termination_for_service',{p_request_id:id});
  if(claimError || typeof token!=='string') throw new Error('service_change_termination_busy');
  current=await state(id);
  const request=current.request;
  if(!request.external_payment_intent_id || request.refund_amount_minor===null || !request.currency) {
    await fail(id,token,'finalize',new Error('service_change_refund_evidence_missing'));
    throw new Error('service_change_refund_evidence_missing');
  }
  let refund=await findServiceChangeStripeRefund(key,id,request.external_payment_intent_id);
  try {
    const charge=await getWithdrawalCharge(key,request.external_payment_intent_id);
    if(!refund && request.refund_amount_minor>0) {
      refund=await createServiceChangeStripeRefund(key,{
        requestId:id,releaseId:request.release_id,paymentIntentId:request.external_payment_intent_id,
        amountMinor:request.refund_amount_minor,currency:request.currency,
      });
    }
    if(refund) {
      const {error}=await createAdminClient().rpc('reconcile_service_change_termination_refund_for_service',{
        p_request_id:id,p_lease_token:token,p_refund_id:refund.id,
        p_payment_intent_id:stripeReference(refund.payment_intent),p_amount:refund.amount,
        p_currency:refund.currency,p_status:refund.status,
      });
      if(error) throw new Error('service_change_refund_reconciliation_failed');
    } else if(charge.amount_refunded>0) {
      throw new Error('service_change_external_refund_review_required');
    }
  } catch(error) { await fail(id,token,'refund',error); throw error; }

  try {
    if(!request.subscription_cancelled_at) {
      const canceled=await cancelWithdrawnSubscription(key,request.external_subscription_id);
      const {error}=await createAdminClient().rpc('record_service_change_termination_cancellation_for_service',{
        p_request_id:id,p_lease_token:token,p_cancelled_at:canceled.canceledAt,
      });
      if(error) throw new Error('service_change_cancellation_reconciliation_failed');
    }
  } catch(error) { await fail(id,token,'cancellation',error); throw error; }
  return state(id);
}
