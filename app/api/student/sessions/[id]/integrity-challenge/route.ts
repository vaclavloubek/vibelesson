import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { participantCookieName } from '@/lib/live';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

const SubmitSchema = z.object({
  evaluationId: z.string().uuid(),
  answer: z.string().trim().min(1).max(1000),
});

async function participantFor(sessionId: string) {
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(sessionId))?.value;
  if (!participantToken) return null;

  const tokenHash = createHash('sha256').update(participantToken).digest('hex');
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('participant_token_hash', tokenHash)
    .gt('participant_token_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data?.id ? { admin, participantId: data.id as string } : null;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: sessionId } = await params;

  try {
    const verified = await participantFor(sessionId);
    if (!verified) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

    const { admin, participantId } = verified;
    const { data: rows, error } = await admin
      .from('response_evaluations')
      .select('id, integrity_challenge_question, integrity_challenge_status, integrity_challenge_presented_at, integrity_challenge_expires_at')
      .eq('session_id', sessionId)
      .eq('participant_id', participantId)
      .eq('integrity_challenge_status', 'pending')
      .not('integrity_challenge_question', 'is', null)
      .order('integrity_challenge_created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    const challenge = rows?.[0];
    if (!challenge) return NextResponse.json({ challenge: null });

    let presentedAt = challenge.integrity_challenge_presented_at as string | null;
    let expiresAt = challenge.integrity_challenge_expires_at as string | null;

    if (!presentedAt || !expiresAt) {
      const now = new Date();
      const expires = new Date(now.getTime() + 60_000);
      const { data: started, error: startError } = await admin
        .from('response_evaluations')
        .update({
          integrity_challenge_presented_at: now.toISOString(),
          integrity_challenge_expires_at: expires.toISOString(),
        })
        .eq('id', challenge.id)
        .eq('integrity_challenge_status', 'pending')
        .is('integrity_challenge_presented_at', null)
        .select('integrity_challenge_presented_at, integrity_challenge_expires_at')
        .maybeSingle();

      if (startError) throw startError;
      presentedAt = (started?.integrity_challenge_presented_at as string | undefined) ?? now.toISOString();
      expiresAt = (started?.integrity_challenge_expires_at as string | undefined) ?? expires.toISOString();

      if (!started) {
        const { data: refreshed, error: refreshError } = await admin
          .from('response_evaluations')
          .select('integrity_challenge_presented_at, integrity_challenge_expires_at')
          .eq('id', challenge.id)
          .maybeSingle();
        if (refreshError) throw refreshError;
        presentedAt = refreshed?.integrity_challenge_presented_at as string | null;
        expiresAt = refreshed?.integrity_challenge_expires_at as string | null;
      }
    }

    if (!presentedAt || !expiresAt) {
      return NextResponse.json({ error: 'Kontrolní otázku se nepodařilo aktivovat.' }, { status: 500 });
    }

    if (Date.parse(expiresAt) <= Date.now()) {
      await admin
        .from('response_evaluations')
        .update({ integrity_challenge_status: 'expired' })
        .eq('id', challenge.id)
        .eq('integrity_challenge_status', 'pending');
      return NextResponse.json({ challenge: null });
    }

    return NextResponse.json({
      challenge: {
        evaluationId: challenge.id,
        question: challenge.integrity_challenge_question,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('student integrity challenge lookup failed', error);
    return NextResponse.json({ error: 'Kontrolní otázku se nepodařilo načíst.' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: sessionId } = await params;

  try {
    const body = SubmitSchema.parse(await req.json());
    const verified = await participantFor(sessionId);
    if (!verified) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

    const { admin, participantId } = verified;
    const { data: challenge, error: lookupError } = await admin
      .from('response_evaluations')
      .select('id, integrity_challenge_status, integrity_challenge_expires_at')
      .eq('id', body.evaluationId)
      .eq('session_id', sessionId)
      .eq('participant_id', participantId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!challenge || challenge.integrity_challenge_status !== 'pending') {
      return NextResponse.json({ error: 'Kontrolní otázka už není aktivní.' }, { status: 409 });
    }

    const expiresAt = challenge.integrity_challenge_expires_at as string | null;
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      await admin
        .from('response_evaluations')
        .update({ integrity_challenge_status: 'expired' })
        .eq('id', body.evaluationId)
        .eq('integrity_challenge_status', 'pending');
      return NextResponse.json({ error: 'Čas na odpověď už vypršel.' }, { status: 410 });
    }

    const { data: saved, error: saveError } = await admin
      .from('response_evaluations')
      .update({
        integrity_challenge_answer: body.answer,
        integrity_challenge_status: 'answered',
        integrity_challenge_submitted_at: new Date().toISOString(),
      })
      .eq('id', body.evaluationId)
      .eq('session_id', sessionId)
      .eq('participant_id', participantId)
      .eq('integrity_challenge_status', 'pending')
      .select('id')
      .maybeSingle();

    if (saveError) throw saveError;
    if (!saved) return NextResponse.json({ error: 'Kontrolní otázka už není aktivní.' }, { status: 409 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Odpověď nemá platný formát.' }, { status: 400 });
    }
    console.error('student integrity challenge submission failed', error);
    return NextResponse.json({ error: 'Odpověď se nepodařilo uložit.' }, { status: 500 });
  }
}
