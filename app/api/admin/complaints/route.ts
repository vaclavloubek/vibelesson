import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { COMPLAINT_OUTCOME_CODES } from '@/lib/complaint-options';
import { ComplaintError, deliverComplaintEmail, resolveComplaint } from '@/lib/complaints';
import { isSuperadminUserId } from '@/lib/superadmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve'),
    complaintId: z.string().uuid(),
    outcome: z.enum(COMPLAINT_OUTCOME_CODES),
    remedyApplied: z.string().trim().max(1000).optional().default(''),
    explanation: z.string().trim().min(10).max(5000),
  }),
  z.object({ action: z.literal('retry_email'), complaintId: z.string().uuid(), kind: z.enum(['receipt', 'resolution']) }),
]);

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'same_origin_required' }, 403);
  const { authenticatedUserId: userId } = await getAuthenticatedUserId();
  if (!userId) return json({ error: 'authentication_required' }, 401);
  if (!isSuperadminUserId(userId)) return json({ error: 'superadmin_required' }, 403);

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_complaint_admin_request' }, 400);
  const input = parsed.data;

  try {
    if (input.action === 'retry_email') {
      const delivery = await deliverComplaintEmail(input.complaintId, input.kind);
      return json({ sent: delivery.sent, sentAt: delivery.sentAt });
    }
    await resolveComplaint({
      complaintId: input.complaintId,
      adminUserId: userId,
      outcome: input.outcome,
      remedyApplied: input.remedyApplied || null,
      explanation: input.explanation,
    });
    try {
      await deliverComplaintEmail(input.complaintId, 'resolution');
      return json({ resolved: true, confirmationSent: true });
    } catch {
      return json({ resolved: true, confirmationSent: false }, 202);
    }
  } catch (error) {
    const code = error instanceof ComplaintError ? error.code : 'complaint_admin_failed';
    const status = code === 'complaint_not_found' ? 404
      : code === 'complaint_already_resolved' ? 409
        : code === 'complaint_remedy_required' ? 400
          : 500;
    return json({ error: code }, status);
  }
}
