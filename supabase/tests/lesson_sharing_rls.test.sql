begin;

select plan(19);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'share-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'share-recipient@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'share-other@example.com');

insert into public.lessons (id, owner_id, title, source_prompt, lesson)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Shared test lesson',
  'Test source',
  '{
    "title":"Shared test lesson",
    "audience":"Teachers",
    "totalMinutes":10,
    "groupSize":"Pairs",
    "learningObjectives":["Explain sharing","Protect results"],
    "blocks":[
      {"id":"one","type":"intro","title":"One","durationMinutes":3,"instructions":"Start"},
      {"id":"two","type":"poll","title":"Two","durationMinutes":3,"instructions":"Vote","options":["A","B"]},
      {"id":"three","type":"exit_ticket","title":"Three","durationMinutes":4,"instructions":"Answer"}
    ]
  }'::jsonb
);

select ok(
  has_table_privilege('authenticated', 'public.lesson_shares', 'select,insert'),
  'authenticated users hold only the share operations needed by the owner flow'
);

select ok(
  not has_table_privilege('authenticated', 'public.lesson_shares', 'delete'),
  'authenticated users cannot delete share audit records'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.lesson_shares (id, lesson_id, owner_id, token, snapshot)
    select
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      id,
      owner_id,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      lesson
    from public.lessons
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'the lesson owner can share the current immutable snapshot'
);

select results_eq(
  $$select count(*)::bigint from public.lesson_shares$$,
  $$values (1::bigint)$$,
  'the owner can read the stored share'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq(
  $$select count(*)::bigint from public.lesson_shares$$,
  $$values (0::bigint)$$,
  'another teacher cannot read the share table directly'
);

select ok(
  public.import_lesson_share('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') is not null,
  'an authenticated recipient can import an active share'
);

select results_eq(
  $$select count(*)::bigint from public.lessons
    where owner_id = '22222222-2222-2222-2222-222222222222'
      and source_share_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  $$values (1::bigint)$$,
  'the imported lesson belongs to the recipient'
);

select is(
  public.import_lesson_share('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  (select id from public.lessons
    where owner_id = '22222222-2222-2222-2222-222222222222'
      and source_share_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'repeated imports return the same lesson id'
);

select throws_ok(
  $$insert into public.lessons (owner_id, title, source_prompt, lesson, source_share_id, source_lesson_id)
    select
      '22222222-2222-2222-2222-222222222222',
      'Forged provenance',
      'Direct client insert',
      lesson,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    from public.lessons
    where owner_id = '22222222-2222-2222-2222-222222222222'
      and source_share_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'a client cannot forge shared-lesson provenance on direct insert'
);

reset role;

select throws_ok(
  $$update public.lessons
    set source_share_id = null, source_lesson_id = null
    where owner_id = '22222222-2222-2222-2222-222222222222'
      and source_share_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  null,
  'shared-lesson provenance cannot be erased after import'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq(
  $$with changed as (
      update public.lessons
      set title = 'Changed by recipient'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      returning id
    ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'the recipient cannot update the source lesson'
);

set local role anon;

select throws_ok(
  $$select * from public.lesson_shares$$,
  '42501',
  null,
  'anonymous visitors have no direct table access'
);

select results_eq(
  $$select public.get_lesson_share('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') ->> 'title'$$,
  $$values ('Shared test lesson'::text)$$,
  'the capability token exposes only the active immutable snapshot'
);

select results_eq(
  $$select public.get_lesson_share('not-a-share-token')$$,
  $$values (null::jsonb)$$,
  'invalid capability tokens reveal no lesson data'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$update public.lesson_shares
    set status = 'revoked', revoked_at = now()
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'the owner can revoke the share'
);

select lives_ok(
  $$insert into public.sessions (lesson_id, teacher_id, join_code, lesson_snapshot)
    select id, owner_id, 'ABCDEFG', lesson
    from public.lessons
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'the teacher can start one active lesson'
);

select throws_ok(
  $$insert into public.sessions (lesson_id, teacher_id, join_code, lesson_snapshot)
    select id, owner_id, 'HJKLMNP', lesson
    from public.lessons
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23505',
  null,
  'the database rejects a second active lesson for the same teacher'
);

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$select public.import_lesson_share('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'P0002',
  null,
  'a revoked share cannot be imported'
);

select is(
  public.get_lesson_share('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  null::jsonb,
  'a revoked share is no longer visible through its capability token'
);

select * from finish();
rollback;
