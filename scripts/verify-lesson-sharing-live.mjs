import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const FEATURE_BRANCH = 'feature/lesson-sharing-0.9.20';

if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== FEATURE_BRANCH) {
  console.log('Sharing live E2E skipped outside the dedicated Preview branch.');
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error('Sharing live E2E: required Supabase Preview credentials are unavailable.');
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const suffix = randomBytes(8).toString('hex');
const ownerEmail = `sharing-owner-${suffix}@example.invalid`;
const recipientEmail = `sharing-recipient-${suffix}@example.invalid`;
const password = randomBytes(24).toString('base64url');

let ownerId = null;
let recipientId = null;
let sourceLessonId = null;
let importedLessonId = null;
let shareId = null;
let firstSessionId = null;

function expect(condition, message) {
  if (!condition) throw new Error(`Sharing live E2E: ${message}`);
}

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Sharing live E2E: temporary Auth user creation failed.');
  return data.user.id;
}

async function authenticatedClient(email) {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error('Sharing live E2E: temporary teacher sign-in failed.');
  return client;
}

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

try {
  ownerId = await createConfirmedUser(ownerEmail);
  recipientId = await createConfirmedUser(recipientEmail);

  const owner = await authenticatedClient(ownerEmail);
  const recipient = await authenticatedClient(recipientEmail);
  const anon = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: sourceLesson, error: sourceError } = await owner
    .from('lessons')
    .insert({
      owner_id: ownerId,
      title: lesson.title,
      source_prompt: 'Synthetic sharing E2E',
      lesson,
    })
    .select('id')
    .single();
  expect(!sourceError && sourceLesson?.id, 'owner could not create the source lesson.');
  sourceLessonId = sourceLesson.id;

  const token = randomBytes(24).toString('hex');
  expect(/^[0-9a-f]{48}$/.test(token), 'generated capability token is not 192-bit hex.');

  const { data: share, error: shareError } = await owner
    .from('lesson_shares')
    .insert({
      lesson_id: sourceLessonId,
      owner_id: ownerId,
      token,
      snapshot: lesson,
    })
    .select('id')
    .single();
  expect(!shareError && share?.id, 'owner could not create an immutable share.');
  shareId = share.id;

  const { data: anonRows, error: anonTableError } = await anon.from('lesson_shares').select('id').limit(1);
  expect(Boolean(anonTableError) && !anonRows, 'anonymous direct table access unexpectedly succeeded.');

  const { data: preview, error: previewError } = await anon.rpc('get_lesson_share', { p_token: token });
  expect(!previewError && preview?.title === lesson.title, 'anonymous capability lookup did not return the snapshot.');

  const { data: invalidPreview, error: invalidPreviewError } = await anon.rpc('get_lesson_share', { p_token: 'not-a-share-token' });
  expect(!invalidPreviewError && invalidPreview === null, 'invalid capability token leaked data.');

  const { data: firstImport, error: firstImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
  expect(!firstImportError && firstImport, 'recipient could not import the share.');
  importedLessonId = firstImport;

  const { data: secondImport, error: secondImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
  expect(!secondImportError && secondImport === importedLessonId, 'import is not idempotent.');

  const { data: imported, error: importedError } = await recipient
    .from('lessons')
    .select('id,owner_id,lesson,source_share_id,source_lesson_id')
    .eq('id', importedLessonId)
    .single();
  expect(!importedError && imported?.owner_id === recipientId, 'imported copy is not owned by recipient.');
  expect(imported?.source_share_id === shareId && imported?.source_lesson_id === sourceLessonId, 'import provenance is missing.');

  const forgedId = crypto.randomUUID?.();
  const { error: forgedError } = await recipient.from('lessons').insert({
    ...(forgedId ? { id: forgedId } : {}),
    owner_id: recipientId,
    title: 'Forged provenance',
    source_prompt: 'Synthetic sharing E2E',
    lesson,
    source_share_id: shareId,
    source_lesson_id: sourceLessonId,
  });
  expect(Boolean(forgedError), 'recipient could forge shared-lesson provenance.');

  const changedLesson = { ...imported.lesson, title: 'Recipient independent copy' };
  const { error: copyUpdateError } = await recipient
    .from('lessons')
    .update({ title: 'Recipient independent copy', lesson: changedLesson })
    .eq('id', importedLessonId);
  expect(!copyUpdateError, 'recipient could not edit the imported copy.');

  const { data: sourceAfter, error: sourceAfterError } = await owner
    .from('lessons')
    .select('title,lesson')
    .eq('id', sourceLessonId)
    .single();
  expect(!sourceAfterError && sourceAfter?.title === lesson.title && sourceAfter?.lesson?.title === lesson.title,
    'editing the recipient copy changed the source lesson.');

  const joinCodeOne = randomBytes(6).toString('hex').slice(0, 7).toUpperCase();
  const joinCodeTwo = randomBytes(6).toString('hex').slice(0, 7).toUpperCase();
  const { data: firstSession, error: firstSessionError } = await owner
    .from('sessions')
    .insert({ lesson_id: sourceLessonId, teacher_id: ownerId, join_code: joinCodeOne, lesson_snapshot: lesson })
    .select('id')
    .single();
  expect(!firstSessionError && firstSession?.id, 'teacher could not create the first active session.');
  firstSessionId = firstSession.id;

  const { error: secondSessionError } = await owner
    .from('sessions')
    .insert({ lesson_id: sourceLessonId, teacher_id: ownerId, join_code: joinCodeTwo, lesson_snapshot: lesson });
  expect(Boolean(secondSessionError) && secondSessionError.code === '23505',
    'database did not reject a second active session for the same teacher.');

  const { error: revokeError } = await owner
    .from('lesson_shares')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', shareId);
  expect(!revokeError, 'owner could not revoke the share.');

  const { data: revokedPreview, error: revokedPreviewError } = await anon.rpc('get_lesson_share', { p_token: token });
  expect(!revokedPreviewError && revokedPreview === null, 'revoked share is still publicly visible.');

  const { error: revokedImportError } = await recipient.rpc('import_lesson_share', { p_token: token });
  expect(Boolean(revokedImportError), 'revoked share could still be imported.');

  console.log('Sharing live E2E PASS');
} finally {
  if (ownerId) {
    await admin.from('sessions').delete().eq('teacher_id', ownerId);
  }
  if (shareId) {
    await admin.from('lesson_shares').delete().eq('id', shareId);
  }
  if (importedLessonId) {
    await admin.from('lessons').delete().eq('id', importedLessonId);
  }
  if (sourceLessonId) {
    await admin.from('lessons').delete().eq('id', sourceLessonId);
  }
  if (recipientId) {
    await admin.auth.admin.deleteUser(recipientId);
  }
  if (ownerId) {
    await admin.auth.admin.deleteUser(ownerId);
  }
}
