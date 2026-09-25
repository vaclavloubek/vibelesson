import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Syllonaut Help: entitlement enforced on the server and in the DB, actions
// limited to the approved allowlist, and no conversation text stored.

const read = (file) => fs.readFileSync(file, 'utf8');
const failures = [];
const check = (condition, label) => {
  if (!condition) failures.push(label);
};

const migration = read('neon/migrations/0017_help_assistant.sql');
const chatRoute = read('app/api/help/chat/route.ts');
const feedbackRoute = read('app/api/help/feedback/route.ts');
const entitlements = read('app/api/entitlements/route.ts');
const assistant = read('lib/help-assistant.ts');
const component = read('components/HelpAssistant.tsx');
const privilegedRpc = read('lib/neon/privileged-rpc.ts');

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function ${name}(`);
  if (start < 0) return '';
  const open = sql.indexOf('$function$', start);
  const close = sql.indexOf('$function$', open + 1);
  return sql.slice(start, close);
}

// 1. Entitlement on the server and in the database.
const postStart = chatRoute.indexOf('export async function POST');
const post = chatRoute.slice(postStart);
check(postStart > 0, 'chat route has a POST handler');
check(post.indexOf('isHelpAssistantSwitchOn()') >= 0 && post.indexOf('isHelpAssistantSwitchOn()') < post.indexOf('getAuthenticatedUserId()'),
  'chat route checks the HELP_ASSISTANT_ENABLED switch first');
check(post.indexOf('getAuthenticatedUserId()') < post.indexOf("'reserve_help_message_server'"), 'chat route authenticates before reserving');
check(post.indexOf("'reserve_help_message_server'") > 0
  && post.indexOf("'reserve_help_message_server'") < post.indexOf('streamHelpAnswer('),
  'chat route reserves the message in the DB before calling the model');
check(post.includes("'finish_help_message_server'"), 'chat route records the result and cost');
check(post.includes('getEffectiveAiBillingPauseState(userId)'), 'chat route answers a payment pause with fixed text');
check(feedbackRoute.includes('isHelpAssistantSwitchOn()') && feedbackRoute.includes('getAuthenticatedUserId()'), 'feedback route is switched and authenticated');
check(entitlements.includes('helpAssistantEnabled') && entitlements.includes('isHelpAssistantSwitchOn()'), '/api/entitlements exposes helpAssistantEnabled behind the switch');
check(assistant.includes("process.env.HELP_ASSISTANT_ENABLED === 'true'"), 'switch is off unless explicitly true');
check(assistant.includes('process.env.HELP_AI_GATEWAY_API_KEY') && assistant.includes('createGateway({ apiKey })'), 'Help uses its own AI Gateway key');
check(/process\.env\.HELP_AI_MODEL \|\| process\.env\.AI_MODEL/.test(assistant), 'HELP_AI_MODEL falls back to AI_MODEL');
check(component.includes("payload?.helpAssistantEnabled === true") && component.includes('if (!userId || !entitled) return null;'),
  'panel renders only for signed-in entitled teachers');

for (const rpc of ['reserve_help_message_server', 'finish_help_message_server', 'get_help_message_usage_server']) {
  check(privilegedRpc.includes(`'${rpc}'`), `${rpc} is allowlisted for the privileged client`);
  check(new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\) to service_role;`).test(migration), `${rpc} is granted to service_role`);
  check(new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from public, anon, anonymous, authenticated, authenticator;`).test(migration),
    `${rpc} is revoked from client roles`);
}
check(!/grant execute on function [^;]*help[^;]* to (authenticated|anon|anonymous|public)/i.test(migration), 'no help RPC is executable by client roles');

const reserve = functionBody(migration, 'public.reserve_help_message_server');
check(reserve.includes('private.help_message_allowance(p_user_id)') && reserve.includes("'not_entitled'"), 'reserve checks the entitlement');
check(reserve.includes('get_effective_ai_billing_pause_state_server(p_user_id)') && reserve.includes("'payment_required'"), 'reserve checks the payment pause');
check(reserve.includes("interval '60 seconds'") && reserve.includes('v_recent >= 6'), 'reserve allows at most 6 messages per minute');
check(reserve.includes("'monthly_limit'") && reserve.includes("'budget_exhausted'"), 'reserve checks the monthly message limit and budget');
check(reserve.includes('for update'), 'reserve serializes concurrent reservations');

const allowance = functionBody(migration, 'private.help_message_allowance');
check(allowance.includes("v_role = 'admin'") && allowance.includes('v_org_plan.monthly_help_budget_usd'), 'allowance: admin unlimited, organization budget shared');

const planValues = migration.slice(migration.indexOf('from (values'), migration.indexOf(') as v(code, enabled'));
const enabledPlans = [...planValues.matchAll(/\('([a-z_]+)', (true|false)/g)].filter((m) => m[2] === 'true').map((m) => m[1]);
check(JSON.stringify(enabledPlans) === JSON.stringify(['admin']), 'only the admin plan has the assistant enabled for now');
const applyPlan = functionBody(migration, 'private.apply_profile_plan');
check(applyPlan.includes('help_assistant_enabled = true,') && applyPlan.includes('v_help := v_plan.help_assistant_enabled or v_org_help;'),
  'apply_profile_plan derives help_assistant_enabled (admin always true)');
check(!/manual_entitlement_overrides[^;]*help_assistant/.test(migration), 'no manual override for the help assistant');

// 2. Actions only from the approved allowlist.
const APPROVED_GUIDE = ['lesson:0', 'lesson:2', 'lesson:3', 'lesson:4', 'lesson:6', 'live:0', 'live:2', 'live:3', 'live:5', 'live:6', 'evaluation:0', 'evaluation:1'];
const APPROVED_LINKS = ['pricing', 'subscription', 'complaint', 'withdrawal', 'contact'];
const APPROVED_TOPICS = ['lesson', 'edit', 'live', 'teams', 'evaluation', 'quota', 'language', 'worksheets', 'billing', 'subscription', 'legal', 'devices', 'other'];

const actions = await import(pathToFileURL(path.resolve('lib/help/actions.ts')).href);
const { SYLLONAUT_GUIDE_STEPS } = await import(pathToFileURL(path.resolve('lib/onboarding-guide-steps.ts')).href);
check(JSON.stringify(actions.HELP_GUIDE_ACTIONS) === JSON.stringify(APPROVED_GUIDE), 'guide actions match the approved allowlist');
check(JSON.stringify(actions.HELP_LINK_ACTIONS) === JSON.stringify(APPROVED_LINKS), 'link actions match the approved allowlist');
check(JSON.stringify(actions.HELP_TOPICS) === JSON.stringify(APPROVED_TOPICS), 'topics match the approved list');
for (const action of APPROVED_GUIDE) {
  const [chapter, step] = action.split(':');
  check(Boolean(SYLLONAUT_GUIDE_STEPS[chapter]?.[Number(step)]?.target), `guide step ${action} exists with a data-tour target`);
}
check(actions.parseHelpActionToken('[[guide:lesson:0]]')?.kind === 'guide', 'allowed guide token parses');
check(actions.parseHelpActionToken('[[guide:lesson:1]]') === null, 'guide step outside the allowlist is rejected');
check(actions.parseHelpActionToken('[[link:https://evil.example]]') === null, 'arbitrary link is rejected');
check(actions.parseHelpActionToken('[[link:admin]]') === null, 'unknown link is rejected');
check(actions.parseHelpTopicToken('[[topic:billing]]') === 'billing' && actions.parseHelpTopicToken('[[topic:secret]]') === null, 'topic token is validated');
check(assistant.includes('parseHelpActionToken(current)') && assistant.includes('parseHelpTopicToken(current)'), 'server output filter drops tokens outside the allowlist');
check(chatRoute.includes('createHelpOutputFilter()'), 'chat route streams through the output filter');
check(component.includes('guideTargetPresent') && component.includes('document.querySelector(`[data-tour="${step.target}"]`)'),
  'guide buttons render only when the data-tour target is on the page');
check(component.includes('startSyllonautGuide(userId, action.chapter, action.step)'), 'guide action starts the existing guide');
check(APPROVED_TOPICS.every((topic) => migration.includes(`'${topic}'`)), 'DB topic check matches the approved topics');

// 3. No conversation text in the database or logs.
const tableStart = migration.indexOf('create table if not exists public.help_assistant_requests');
const tableSql = migration.slice(tableStart, migration.indexOf(');', tableStart));
const columns = [...tableSql.matchAll(/^\s{2}([a-z_]+)\s/gm)].map((m) => m[1]).filter((name) => name !== 'check');
check(JSON.stringify(columns) === JSON.stringify(['id', 'user_id', 'organization_id', 'created_at', 'completed_at', 'status', 'cost_usd', 'route', 'topic', 'feedback']),
  `help_assistant_requests has only metadata columns (found: ${columns.join(', ')})`);
check(!/(message|content|prompt|answer|question|history|body)\b/i.test(columns.join(' ')), 'no conversation column');
check(/check \(route ~ '\^\/\[a-z0-9\/_\\\[\\\]-\]\{0,80\}\$'\)/.test(tableSql), 'route is a short pattern, not free text');
const finish = functionBody(migration, 'public.finish_help_message_server');
check(!/\bp_(message|messages|content|text|answer|question|history)\b/.test(finish + reserve), 'RPCs take no conversation text');
const logLines = [...chatRoute.matchAll(/console\.(error|log|warn)\(([^;]*)\);/g)].map((m) => m[2]);
check(logLines.length > 0 && logLines.every((line) => !/\b(message|history|messages|content|raw|text)\b/.test(line)), 'chat route never logs conversation text');
check(!/onError\(\s*[a-zA-Z]/.test(assistant), 'model errors are not logged with their payload');
check(feedbackRoute.includes(".update({ feedback: parsed.data.feedback })"), 'feedback route only writes the feedback column');
check(migration.includes('grant update (feedback) on public.help_assistant_requests to authenticated;'), 'teachers can update only the feedback column');

if (failures.length) {
  console.error('Help assistant check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Help assistant checks passed: server/DB entitlement, action allowlist, no conversation text stored.');
