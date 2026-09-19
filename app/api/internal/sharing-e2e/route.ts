import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEATURE_BRANCH = 'feature/lesson-sharing-0.9.20';
const E2E_GUARD = '76d33152eb3241d23c489de871b49ebb4bbd8d836c2f9e0b';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== FEATURE_BRANCH
    || request.headers.get('x-syllonaut-e2e') !== E2E_GUARD
  ) {
    return new Response(null, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return json({ ok: false, stage: 'runtime-public-env' }, 500);
  const supabaseUrl = url;
  const supabasePublishableKey = publishableKey;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return json({ ok: false, stage: 'runtime-admin-env' }, 500);
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

  function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  async function createConfirmedUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error('temporary Auth user creation failed');
    return data.user.id;
  }

  async function authenticatedClient(email: string) {
    const client = createClient(supabaseUrl, supabasePublishableKey, {
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
    const anon = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    stage = 'create-source-lesson';
    const { data: sourceLesson, error: sourceError } = await owner
      .from('lessons')
      .insert({ owner_id: ownerId, title: lesson.title, source_prompt: 'Synthetic sharing E2E', lesson })
      .select('id')
      .single();
    expect(!sourceError && sourceLesson?.id, 'owner could not create source lesson');
    sourceLessonId = sourceLesson.id;

    const capabilityToken = randomBytes(24).toString('hex');
    expect(/^[0-9a-f]{48}$/.test(capabilityToken), 'capability token format failed');

    stage = 'create-share';
    const { data: share, error: shareError } = await owner
      .from('lesson_shares')
      .insert({ lesson_id: sourceLessonId, owner_id: ownerId, token: capabilityToken, snapshot: lesson })
      .select('id')
      .single();
    expect(!shareError && share?.id, 'owner could not create share');
    shareId = share.id;

    stage = 'anon-direct-table-denied';
    const { data: anonRows, error: anonTableError } = await anon.from('lesson_shares').select('id').limit(1);
    expect(Boolean(anonTableError) && anonRows === null, 'anonymous direct table access succeeded');

    stage = 'anon-capability-preview';
    const { data: preview, error: previewError } = await anon.rpc('get_lesson_share', { p_token: capabilityToken });
    expect(!previewError && preview?.title === lesson.title, 'capability lookup failed');

    stage = 'invalid-token';
    const { data: invalidPreview, error: invalidPreviewError } = await anon.rpc('get_lesson_share', { p_token: 'not-a-share-token' });
    expect(!invalidPreviewError && invalidPreview === null, 'invalid token leaked data');

    stage = 'public-preview-http';
    const origin = new URL(request.url).origin;
    const publicResponse = await fetch(`${origin}/s/${capabilityToken}`, { cache: 'no-store', redirect: 'manual' });
    const publicHtml = await publicResponse.text();
    expect(publicResponse.status === 200, 'valid public share did not render');
    expect(/name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*nofollow/i.test(publicHtml)
      || /content=["'][^"']*noindex[^"']*nofollow[^"']*["'][^>]*name=["']robots/i.test(publicHtml),
      'public share is missing noindex,nofollow');
    expect(/name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(publicHtml)
      || /content=["']no-referrer["'][^>]*name=["']referrer["']/i.test(publicHtml),
      'public share is missing no-referrer');
    expect(!/Odstartovat hodinu|Start lesson|Upravit blok|Edit block/i.test(publicHtml), 'public share exposes editor/live controls');
    expect(!/googletagmanager\.com\/gtag\/js/i.test(publicHtml), 'public share server HTML includes GA');

    stage = 'invalid-preview-http';
    const invalidHttp = await fetch(`${origin}/s/${'0'.repeat(48)}`, { cache: 'no-store', redirect: 'manual' });
    expect(invalidHttp.status === 404, 'invalid 48-hex share URL did not return 404');

    stage = 'pricing-cs';
    const csPricing = await fetch(`${origin}/cs/pricing`, { cache: 'no-store' });
    const csHtml = await csPricing.text();
    expect(csPricing.status === 200 && /Ceník|Pro učitele/i.test(csHtml), 'Czech pricing failed');

    stage = 'pricing-en';
    const enPricing = await fetch(`${origin}/en/pricing`, { cache: 'no-store' });
    const enHtml = await enPricing.text();
    expect(enPricing.status === 200 && /Pricing|For teachers/i.test(enHtml), 'English pricing failed');

    stage = 'first-import';
    const { data: firstImport, error: firstImportError } = await recipient.rpc('import_lesson_share', { p_token: capabilityToken });
    expect(!firstImportError && firstImport, 'first import failed');
    importedLessonId = firstImport;

    stage = 'idempotent-import';
    const { data: secondImport, error: secondImportError } = await recipient.rpc('import_lesson_share', { p_token: capabilityToken });
    expect(!secondImportError && secondImport === importedLessonId, 'import is not idempotent');

    stage = 'verify-import-owner';
    const { data: imported, error: importedError } = await recipient
      .from('lessons')
      .select('id,owner_id,lesson,source_share_id,source_lesson_id')
      .eq('id', importedLessonId)
      .single();
    expect(!importedError && imported?.owner_id === recipientId, 'copy owner mismatch');
    expect(imported?.source_share_id === shareId && imported?.source_lesson_id === sourceLessonId, 'copy provenance mismatch');

    stage = 'forged-provenance-denied';
    const { error: forgedError } = await recipient.from('lessons').insert({
      id: randomUUID(),
      owner_id: recipientId,
      title: 'Forged provenance',
      source_prompt: 'Synthetic sharing E2E',
      lesson,
      source_share_id: shareId,
      source_lesson_id: sourceLessonId,
    });
    expect(Boolean(forgedError), 'recipient forged provenance');

    stage = 'edit-recipient-copy';
    const changedLesson = { ...imported.lesson, title: 'Recipient independent copy' };
    const { error: copyUpdateError } = await recipient
      .from('lessons')
      .update({ title: 'Recipient independent copy', lesson: changedLesson })
      .eq('id', importedLessonId);
    expect(!copyUpdateError, 'recipient could not edit copy');

    stage = 'verify-source-unchanged';
    const { data: sourceAfter, error: sourceAfterError } = await owner
      .from('lessons')
      .select('title,lesson')
      .eq('id', sourceLessonId)
      .single();
    expect(!sourceAfterError && sourceAfter?.title === lesson.title && sourceAfter?.lesson?.title === lesson.title,
      'recipient edit changed source');

    stage = 'first-live-session';
    const joinCodeOne = randomBytes(6).toString('hex').slice(0, 7).toUpperCase();
    const { data: firstSession, error: firstSessionError } = await owner
      .from('sessions')
      .insert({ lesson_id: sourceLessonId, teacher_id: ownerId, join_code: joinCodeOne, lesson_snapshot: lesson })
      .select('id')
      .single();
    expect(!firstSessionError && firstSession?.id, 'first active session failed');

    stage = 'second-live-session-rejected';
    const joinCodeTwo = randomBytes(6).toString('hex').slice(0, 7).toUpperCase();
    const { error: secondSessionError } = await owner
      .from('sessions')
      .insert({ lesson_id: sourceLessonId, teacher_id: ownerId, join_code: joinCodeTwo, lesson_snapshot: lesson });
    expect(Boolean(secondSessionError) && secondSessionError?.code === '23505', 'second active session was not rejected');

    stage = 'revoke-share';
    const { error: revokeError } = await owner
      .from('lesson_shares')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', shareId);
    expect(!revokeError, 'share revoke failed');

    stage = 'revoked-preview-hidden';
    const { data: revokedPreview, error: revokedPreviewError } = await anon.rpc('get_lesson_share', { p_token: capabilityToken });
    expect(!revokedPreviewError && revokedPreview === null, 'revoked share still public');

    stage = 'revoked-import-denied';
    const { error: revokedImportError } = await recipient.rpc('import_lesson_share', { p_token: capabilityToken });
    expect(Boolean(revokedImportError), 'revoked share still importable');

    return json({ ok: true, stages: 19 });
  } catch {
    return json({ ok: false, stage }, 500);
  } finally {
    if (ownerId) await admin.from('sessions').delete().eq('teacher_id', ownerId);
    if (sourceLessonId) await admin.from('lessons').delete().eq('id', sourceLessonId);
    if (importedLessonId) await admin.from('lessons').delete().eq('id', importedLessonId);
    if (recipientId) await admin.auth.admin.deleteUser(recipientId);
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  }
}
