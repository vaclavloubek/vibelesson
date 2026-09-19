import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEATURE_BRANCH = 'feature/lesson-sharing-0.9.20';
const E2E_GUARD = 'a3e6f0d81c9b4f5292b8f4516e0a7c3d';

function respond(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== FEATURE_BRANCH
    || request.headers.get('x-syllonaut-e2e') !== E2E_GUARD
  ) return new Response(null, { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return respond({ ok: false, stage: 'public-env' }, 500);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return respond({ ok: false, stage: 'admin-env' }, 500);
  }

  const suffix = randomBytes(8).toString('hex');
  const ownerEmail = `sharing-owner-${suffix}@example.invalid`;
  const recipientEmail = `sharing-recipient-${suffix}@example.invalid`;
  const password = randomBytes(24).toString('base64url');

  let stage = 'bootstrap';
  let ownerId: string | null = null;
  let recipientId: string | null = null;
  let sourceLessonId: string | null = null;
  let importedLessonId: string | null = null;
  let shareId: string | null = null;

  const lesson = {
    title: 'Sharing E2E synthetic lesson',
    audience: 'Teachers',
    totalMinutes: 10,
    groupSize: 'Pairs',
    learningObjectives: ['Verify secure sharing', 'Verify independent copies'],
    blocks: [
      { id: 'one', type: 'intro', title: 'One', durationMinutes: 3, instructions: 'Start' },
      { id: 'two', type: 'poll', title: 'Two', durationMinutes: 3, instructions: 'Vote', options: ['A', 'B'] },
      { id: 'three', type: 'exit_ticket', title: 'Three', durationMinutes: 4, instructions: 'Answer' },
    ],
  };

  const expect = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };

  async function createConfirmedUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error('temporary Auth user creation failed');
    return data.user.id;
  }

  async function authenticatedClient(email: string) {
    const client = createClient(url!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error('temporary teacher sign-in failed');
    return client;
  }

  try {
    stage = 'create-owner';
    ownerId = await createConfirmedUser(ownerEmail);
    stage = 'create-recipient';
    recipientId = await createConfirmedUser(recipientEmail);

    stage = 'signin-owner';
    const owner = await authenticatedClient(ownerEmail);
    stage = 'signin-recipient';
    const recipient = await authenticatedClient(recipientEmail);
    const anon = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    stage = 'create-source';
    const { data: sourceLesson, error: sourceError } = await owner.from('lessons').insert({
      owner_id: ownerId, title: lesson.title, source_prompt: 'Synthetic sharing E2E', lesson,
    }).select('id').single();
    expect(!sourceError && sourceLesson?.id, 'source lesson creation failed');
    sourceLessonId = sourceLesson!.id;

    const token = randomBytes(24).toString('hex');
    expect(/^[0-9a-f]{48}$/.test(token), 'token format failed');

    stage = 'create-share';
    const { data: share, error: shareError } = await owner.from('lesson_shares').insert({
      lesson_id: sourceLessonId, owner_id: ownerId, token, snapshot: lesson,
    }).select('id').single();
    expect(!shareError && share?.id, 'share creation failed');
    shareId = share!.id;

    stage = 'anon-table-denied';
    const { data: anonRows, error: anonTableError } = await anon.from('lesson_shares').select('id').limit(1);
    expect(Boolean(anonTableError) && anonRows === null, 'anon table read succeeded');

    stage = 'capability-preview';
    const { data: preview, error: previewError } = await anon.rpc('get_lesson_share', { p_token: token });
    expect(!previewError && preview?.title === lesson.title, 'capability preview failed');

    stage = 'invalid-token';
    const { data: invalidPreview, error: invalidError } = await anon.rpc('get_lesson_share', { p_token: 'not-a-share-token' });
    expect(!invalidError && invalidPreview === null, 'invalid token leaked data');

    const origin = new URL(request.url).origin;

    stage = 'public-preview-http';
    const publicResponse = await fetch(`${origin}/s/${token}`, { cache: 'no-store' });
    const publicHtml = await publicResponse.text();
    expect(publicResponse.status === 200, 'valid share page failed');
    expect(/noindex/i.test(publicHtml) && /nofollow/i.test(publicHtml), 'robots privacy missing');
    expect(/no-referrer/i.test(publicHtml), 'referrer privacy missing');
    expect(!/Odstartovat hodinu|Start lesson|Upravit blok|Edit block/i.test(publicHtml), 'editor/live controls exposed');

    stage = 'invalid-preview-http';
    const invalidHttp = await fetch(`${origin}/s/${'0'.repeat(48)}`, { cache: 'no-store', redirect: 'manual' });
    expect(invalidHttp.status === 404, 'invalid 48-hex URL is not 404');

    stage = 'pricing-cs';
    const csPricing = await fetch(`${origin}/cs/pricing`, { cache: 'no-store' });
    const csHtml = await csPricing.text();
    expect(csPricing.status === 200 && /Ceník|Pro učitele/i.test(csHtml), 'Czech pricing failed');

    stage = 'pricing-en';
    const enPricing = await fetch(`${origin}/en/pricing`, { cache: 'no-store' });
    const enHtml = await enPricing.text();
    expect(enPricing.status === 200 && /Pricing|For teachers/i.test(enHtml), 'English pricing failed');

    stage = 'first-import';
    const { data: firstImport, error: firstImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
    expect(!firstImportError && firstImport, 'first import failed');
    importedLessonId = firstImport as string;

    stage = 'idempotent-import';
    const { data: secondImport, error: secondImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
    expect(!secondImportError && secondImport === importedLessonId, 'import not idempotent');

    stage = 'copy-owner-provenance';
    const { data: imported, error: importedError } = await recipient.from('lessons')
      .select('owner_id,lesson,source_share_id,source_lesson_id')
      .eq('id', importedLessonId).single();
    expect(!importedError && imported?.owner_id === recipientId, 'copy owner mismatch');
    expect(imported?.source_share_id === shareId && imported?.source_lesson_id === sourceLessonId, 'provenance mismatch');

    stage = 'forged-provenance-denied';
    const { error: forgedError } = await recipient.from('lessons').insert({
      id: randomUUID(), owner_id: recipientId, title: 'Forged provenance',
      source_prompt: 'Synthetic sharing E2E', lesson, source_share_id: shareId, source_lesson_id: sourceLessonId,
    });
    expect(Boolean(forgedError), 'forged provenance succeeded');

    stage = 'independent-copy-edit';
    const changedLesson = { ...(imported!.lesson as Record<string, unknown>), title: 'Recipient independent copy' };
    const { error: updateError } = await recipient.from('lessons')
      .update({ title: 'Recipient independent copy', lesson: changedLesson }).eq('id', importedLessonId);
    expect(!updateError, 'copy edit failed');

    stage = 'source-unchanged';
    const { data: sourceAfter, error: sourceAfterError } = await owner.from('lessons')
      .select('title,lesson').eq('id', sourceLessonId).single();
    expect(!sourceAfterError && sourceAfter?.title === lesson.title && sourceAfter?.lesson?.title === lesson.title,
      'source changed after copy edit');

    stage = 'first-session';
    const { data: firstSession, error: firstSessionError } = await owner.from('sessions').insert({
      lesson_id: sourceLessonId, teacher_id: ownerId,
      join_code: randomBytes(6).toString('hex').slice(0, 7).toUpperCase(), lesson_snapshot: lesson,
    }).select('id').single();
    expect(!firstSessionError && firstSession?.id, 'first session failed');

    stage = 'second-session-rejected';
    const { error: secondSessionError } = await owner.from('sessions').insert({
      lesson_id: sourceLessonId, teacher_id: ownerId,
      join_code: randomBytes(6).toString('hex').slice(0, 7).toUpperCase(), lesson_snapshot: lesson,
    });
    expect(Boolean(secondSessionError) && secondSessionError?.code === '23505', 'second active session was not rejected');

    stage = 'revoke';
    const { error: revokeError } = await owner.from('lesson_shares')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', shareId);
    expect(!revokeError, 'revoke failed');

    stage = 'revoked-hidden';
    const { data: revokedPreview, error: revokedPreviewError } = await anon.rpc('get_lesson_share', { p_token: token });
    expect(!revokedPreviewError && revokedPreview === null, 'revoked share still visible');

    stage = 'revoked-import-denied';
    const { error: revokedImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
    expect(Boolean(revokedImportError), 'revoked share still importable');

    return respond({ ok: true, stage: 'complete' });
  } catch {
    return respond({ ok: false, stage }, 500);
  } finally {
    if (ownerId) await admin.from('sessions').delete().eq('teacher_id', ownerId);
    if (importedLessonId) await admin.from('lessons').delete().eq('id', importedLessonId);
    if (shareId) await admin.from('lesson_shares').delete().eq('id', shareId);
    if (sourceLessonId) await admin.from('lessons').delete().eq('id', sourceLessonId);
    if (recipientId) await admin.auth.admin.deleteUser(recipientId);
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  }
}
