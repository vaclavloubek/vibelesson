import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { COMPLAINT_REMEDY_CODES, COMPLAINT_SUBJECT_AREA_CODES } from '@/lib/complaint-options';
import { ComplaintError, deliverComplaintEmail, submitComplaint } from '@/lib/complaints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    clientRequestId: z.string().uuid(),
    customerName: z.string().trim().min(2).max(160),
    contactEmail: z.string().trim().email().max(254),
    subjectArea: z.enum(COMPLAINT_SUBJECT_AREA_CODES),
    description: z.string().trim().min(20).max(5000),
    requestedRemedy: z.enum(COMPLAINT_REMEDY_CODES),
    remedyNote: z.string().trim().max(1000).optional().default(''),
    locale: z.enum(['cs', 'en']),
  }),
  z.object({ action: z.literal('retry_confirmation'), complaintId: z.string().uuid() }),
]);

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'same_origin_required' }, 403);
  // A complaint is a statutory right: it must not depend on accepting newer Terms.
  const { authenticatedUserId: userId } = await getAuthenticatedUserId();
  if (!userId) return json({ error: 'authentication_required' }, 401);

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_complaint' }, 400);
  const input = parsed.data;
  if (input.action === 'submit' && input.requestedRemedy === 'other' && !input.remedyNote) {
    return json({ error: 'complaint_remedy_note_required' }, 400);
  }

  try {
    if (input.action === 'retry_confirmation') {
      const delivery = await deliverComplaintEmail(input.complaintId, 'receipt', userId);
      return json({ accepted: true, complaintId: input.complaintId, confirmationSent: delivery.sent });
    }

    const receipt = await submitComplaint({
      userId,
      clientRequestId: input.clientRequestId,
      customerName: input.customerName,
      contactEmail: input.contactEmail.toLowerCase(),
      subjectArea: input.subjectArea,
      description: input.description,
      requestedRemedy: input.requestedRemedy,
      remedyNote: input.remedyNote || null,
      locale: input.locale,
    });

    try {
      await deliverComplaintEmail(receipt.complaintId, 'receipt', userId);
      return json({ accepted: true, ...receipt, confirmationSent: true });
    } catch (error) {
      console.error('complaint confirmation delivery pending', {
        complaintId: receipt.complaintId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return json({ accepted: true, ...receipt, confirmationSent: false }, 202);
    }
  } catch (error) {
    const code = error instanceof ComplaintError ? error.code : 'complaint_failed';
    const status = code === 'complaints_unavailable' ? 503
      : code === 'complaint_rate_limited' ? 429
        : code === 'complaint_not_found' ? 404
          : 500;
    if (status === 500) console.error('complaint submission failed', { error: error instanceof Error ? error.message : 'unknown' });
    return json({ error: code }, status);
  }
}
