import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getIndividualWithdrawalQuote } from '@/lib/individual-withdrawal-service';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  cancelStripeSubscriptionForWithdrawal,
  createStripeWithdrawalRefund,
  StripeWithdrawalApiError,
} from '@/lib/stripe-withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConfirmSchema = z.object({
  confirm: z.literal(true),
});

const ReservationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['processing', 'refund_succeeded', 'completed', 'needs_attention']),
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9_]+$/),
  refundAmountMinor: z.number().int().nonnegative(),
  targetTotalRefundMinor: z.number().int().nonnegative(),
  retainedAmountMinor: z.number().int().nonnegative(),
  externalRefundId: z.string().nullable(),
  refundStatus: z.string().nullable(),
  withdrawalReceivedAt: z.string(),
  subscriptionCancelledAt: z.string().nullable(),
  failureStage: z.string().nullable(),
  failureCode: z.string().nullable(),
});

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function recordFailure(requestId: string, stage: 'refund' | 'cancellation' | 'finalize', code: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('fail_individual_withdrawal_for_service', {
    p_request_id: requestId,
    p_failure_stage: stage,
    p_failure_code: code,
  });
  if (error) {
    console.error('withdrawal failure audit failed', { requestId, stage, code, dbCode: error.code });
  }
}

export async function GET() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return response({ error: 'authentication_required' }, 401);

  try {
    const quote = await getIndividualWithdrawalQuote(userId);
    return response(quote);
  } catch (error) {
    console.error('withdrawal quote failed', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return response({ error: 'withdrawal_quote_failed' }, 500);
  }
}

export async function POST(request: Request) {
  let input: z.infer<typeof ConfirmSchema>;
  try {
    input = ConfirmSchema.parse(await request.json());
  } catch {
    return response({ error: 'invalid_withdrawal_confirmation' }, 400);
  }
  if (!input.confirm) return response({ error: 'invalid_withdrawal_confirmation' }, 400);

  const { userId } = await getAuthenticatedUserId();
  if (!userId) return response({ error: 'authentication_required' }, 401);

  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  const admin = createAdminClient();

  let quote;
  try {
    quote = await getIndividualWithdrawalQuote(userId);
  } catch (error) {
    console.error('withdrawal confirmation quote failed', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return response({ error: 'withdrawal_quote_failed' }, 500);
  }

  if (quote.kind === 'completed') {
    return response({
      completed: true,
      requestId: quote.requestId,
      retainedAmountMinor: quote.retainedAmountMinor,
      targetTotalRefundMinor: quote.targetTotalRefundMinor,
      refundAmountMinor: quote.refundAmountMinor,
      currency: quote.currency,
      subscriptionCancelledAt: quote.subscriptionCancelledAt ?? quote.stripeCanceledAt,
    });
  }

  if (quote.kind === 'manual_review' || quote.kind === 'unavailable') {
    return response({ error: 'withdrawal_not_automatable', kind: quote.kind, reason: quote.reason }, 409);
  }

  let requestState: z.infer<typeof ReservationSchema>;
  let subscriptionId: string;
  let currency: 'czk' | 'eur' | 'usd';

  if (quote.kind === 'eligible') {
    const calculation = quote.calculation;
    const { data, error } = await admin.rpc('reserve_individual_withdrawal_for_service', {
      p_user_id: userId,
      p_snapshot_id: quote.snapshotId,
      p_subscription_id: quote.subscriptionId,
      p_contract_concluded_at: quote.contractConcludedAt,
      p_service_period_start: calculation.periodStart,
      p_service_started_at: calculation.serviceStartedAt,
      p_service_period_end: calculation.periodEnd,
      p_withdrawal_received_at: calculation.withdrawalReceivedAt,
      p_retained_amount_minor: calculation.retainedAmountMinor,
      p_target_total_refund_minor: calculation.targetTotalRefundMinor,
      p_refund_amount_minor: calculation.refundNowMinor,
    });
    if (error) {
      console.error('withdrawal reservation failed', { userId, code: error.code });
      return response({ error: 'withdrawal_reservation_failed' }, 500);
    }
    const parsed = ReservationSchema.safeParse(data);
    if (!parsed.success) return response({ error: 'withdrawal_reservation_invalid' }, 500);
    requestState = parsed.data;
    subscriptionId = quote.subscriptionId;
    currency = quote.currency;
  } else {
    requestState = {
      id: quote.requestId,
      status: quote.status,
      paymentIntentId: quote.paymentIntentId,
      refundAmountMinor: quote.refundAmountMinor,
      targetTotalRefundMinor: quote.targetTotalRefundMinor,
      retainedAmountMinor: quote.retainedAmountMinor,
      externalRefundId: quote.externalRefundId,
      refundStatus: quote.refundStatus,
      withdrawalReceivedAt: quote.withdrawalReceivedAt,
      subscriptionCancelledAt: quote.subscriptionCancelledAt,
      failureStage: quote.failureStage,
      failureCode: quote.failureCode,
    };
    subscriptionId = quote.subscriptionId;
    currency = quote.currency;
  }

  let externalRefundId = requestState.externalRefundId;
  let refundStatus = requestState.refundStatus;

  if (requestState.refundAmountMinor > 0 && !externalRefundId) {
    try {
      const refund = await createStripeWithdrawalRefund({
        secretKey,
        paymentIntentId: requestState.paymentIntentId,
        amountMinor: requestState.refundAmountMinor,
        requestId: requestState.id,
      });
      externalRefundId = refund.refundId;
      refundStatus = refund.status;

      const { error: auditError } = await admin.rpc('record_individual_withdrawal_refund_for_service', {
        p_request_id: requestState.id,
        p_refund_id: refund.refundId,
        p_refund_status: refund.status ?? '',
        p_refunded_at: new Date().toISOString(),
      });
      if (auditError) {
        await recordFailure(requestState.id, 'finalize', 'refund_audit_failed');
        return response({ error: 'withdrawal_refund_audit_failed' }, 502);
      }
    } catch (error) {
      const code = error instanceof StripeWithdrawalApiError ? error.message : 'stripe_refund_unknown';
      await recordFailure(requestState.id, 'refund', code);
      console.error('withdrawal refund failed', {
        requestId: requestState.id,
        code,
        stripeCode: error instanceof StripeWithdrawalApiError ? error.stripeCode : null,
      });
      return response({ error: 'withdrawal_refund_failed' }, 502);
    }
  }

  let cancelledAt = requestState.subscriptionCancelledAt;
  if (!cancelledAt) {
    try {
      const cancelled = await cancelStripeSubscriptionForWithdrawal({
        secretKey,
        subscriptionId,
        requestId: requestState.id,
      });
      cancelledAt = cancelled.canceledAt;
    } catch (error) {
      const code = error instanceof StripeWithdrawalApiError ? error.message : 'stripe_cancellation_unknown';
      await recordFailure(requestState.id, 'cancellation', code);
      console.error('withdrawal cancellation failed', {
        requestId: requestState.id,
        code,
        stripeCode: error instanceof StripeWithdrawalApiError ? error.stripeCode : null,
        refundAlreadyCreated: Boolean(externalRefundId),
      });
      return response({
        error: externalRefundId
          ? 'withdrawal_cancellation_failed_after_refund'
          : 'withdrawal_cancellation_failed',
      }, 502);
    }
  }

  const { error: completionError } = await admin.rpc('complete_individual_withdrawal_for_service', {
    p_request_id: requestState.id,
    p_subscription_cancelled_at: cancelledAt,
  });
  if (completionError) {
    await recordFailure(requestState.id, 'finalize', 'completion_audit_failed');
    return response({ error: 'withdrawal_completion_audit_failed' }, 502);
  }

  return response({
    completed: true,
    requestId: requestState.id,
    retainedAmountMinor: requestState.retainedAmountMinor,
    targetTotalRefundMinor: requestState.targetTotalRefundMinor,
    refundAmountMinor: requestState.refundAmountMinor,
    externalRefundId,
    refundStatus,
    currency,
    subscriptionCancelledAt: cancelledAt,
  });
}
