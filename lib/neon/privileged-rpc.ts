import 'server-only';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

// These are server-only application RPCs audited against the imported SQL
// migrations. No caller-controlled function or argument identifier reaches SQL.
const ALLOWED_RPCS = new Set([
  'accept_organization_invitation',
  'activate_organization_order',
  'claim_individual_withdrawal_for_service',
  'claim_service_change_deliveries_for_service',
  'claim_service_change_termination_for_service',
  'create_live_session_server',
  'create_organization_order',
  'create_organization_renewal_order',
  'create_organization_invitation',
  'expire_organization_licenses',
  'finish_generation_request_server',
  'fail_individual_withdrawal_execution_for_service',
  'fail_service_change_delivery_for_service',
  'fail_service_change_termination_for_service',
  'get_effective_ai_billing_pause_state_server',
  'get_individual_ai_billing_pause_reason_server',
  'get_individual_withdrawal_context_for_service',
  'get_individual_withdrawal_for_service',
  'get_organization_ai_billing_pause_reason_server',
  'get_organization_member_device_usage_server',
  'get_organization_seat_usage',
  'get_online_individual_withdrawal_confirmation_for_service',
  'get_online_individual_withdrawal_for_service',
  'get_service_change_notices_for_user_service',
  'get_service_change_termination_for_service',
  'get_student_public_scoreboard',
  'has_any_terms_acceptance_for_service',
  'has_terms_acceptance_for_service',
  'import_lesson_share_server',
  'issue_organization_bank_invoice',
  'list_trusted_devices_server',
  'match_organization_bank_payment',
  'mark_organization_notification_sent',
  'publish_service_change_for_service',
  'reconcile_individual_withdrawal_refund_for_service',
  'reconcile_service_change_termination_refund_for_service',
  'requeue_response_evaluation_server',
  'record_online_individual_withdrawal_confirmation_for_service',
  'record_individual_withdrawal_cancellation_for_service',
  'record_service_change_delivery_sent_for_service',
  'record_service_change_termination_cancellation_for_service',
  'record_terms_reconsent_for_service',
  'register_individual_withdrawal_receipt_for_service',
  'register_online_individual_withdrawal_for_service',
  'register_trusted_device_server',
  'release_contact_form_rate_limit_server',
  'request_service_change_termination_for_service',
  'reserve_individual_withdrawal_v2_for_service',
  'reserve_lesson_generation_server',
  'reserve_revision_operation_server',
  'reserve_service_change_termination_refund_for_service',
  'reset_organization_member_devices_server',
  'revoke_trusted_device_server',
  'set_organization_cancel_at_period_end',
  'transfer_organization_ownership',
  'suspend_overdue_organizations',
]);

// PostgREST returns RETURNS TABLE functions as arrays, including a one-row
// result. Keep that shape when calling the same functions over direct SQL.
const TABLE_RPCS = new Set([
  'reserve_lesson_generation_server',
  'reserve_revision_operation_server',
]);

type RpcError = { code: string; message: string };
type RpcResult = { data: any; error: RpcError | null }; // Match the Supabase RPC result at existing call sites.

export function createPrivilegedRpcClient(): {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
} {
  if (getDatabaseBackend() !== 'neon') {
    return createAdminClient() as unknown as ReturnType<typeof createPrivilegedRpcClient>;
  }

  assertApprovedNeonCutover();
  return {
    async rpc(name, args = {}) {
      if (!ALLOWED_RPCS.has(name)) {
        throw new Error('Privileged Neon RPC is not allowlisted.');
      }
      const keys = Object.keys(args);
      if (keys.some((key) => !/^p_[a-z][a-z0-9_]*$/.test(key))) {
        throw new Error('Privileged Neon RPC has an invalid argument name.');
      }
      const bindings = keys.map((key, index) => `${key} => $${index + 1}`).join(', ');
      const values = keys.map((key) => args[key] ?? null);
      try {
        const rows = TABLE_RPCS.has(name)
          ? await createNeonSql().query(
            `select to_jsonb(result) as data from public.${name}(${bindings}) as result`,
            values,
          )
          : await createNeonSql().query(
            `select public.${name}(${bindings}) as data`,
            values,
          );
        if (TABLE_RPCS.has(name)) return { data: rows.map((row) => row.data), error: null };
        if (rows.length !== 1) throw new Error('unexpected_privileged_rpc_result');
        return { data: rows[0].data, error: null };
      } catch (cause) {
        return {
          data: null,
          error: {
            code: cause && typeof cause === 'object' && 'code' in cause
              ? String(cause.code) : 'neon_rpc_failed',
            message: cause instanceof Error ? cause.message : 'Neon RPC failed.',
          },
        };
      }
    },
  };
}
