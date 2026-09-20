import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing past-due AI safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(path.join('supabase/migrations', name)))
  .join('\n');

for (const [needle, label] of [
  ['individual_ai_billing_paused', 'central payment-state helper'],
  ["bs.status = 'past_due'", 'past_due is the AI pause condition'],
  ["o.status = 'active'", 'active organization exemption'],
  ["p.role = 'admin'", 'internal admin exemption'],
  ['get_individual_ai_billing_paused_server', 'service-only server read path'],
  ['generation_requests_enforce_ai_payment_state', 'generation/revision DB write-boundary trigger'],
  ["new.action in ('generate_lesson', 'revise_lesson', 'revise_block')", 'only AI generation/revision actions are blocked'],
  ['manual-payment-v1', 'AI grading falls back to manual review'],
  ['delete from private.grading_jobs', 'grading dispatch clears queued worker jobs while payment is paused'],
  ['if private.individual_ai_billing_paused(v_user_id) then', 'grading budget fails closed during payment pause'],
]) requireText(migrations, needle, label);

for (const file of [
  'app/api/generate/route.ts',
  'app/api/revise/route.ts',
  'app/api/revise-block/route.ts',
  'app/api/sessions/[id]/evaluations/process/route.ts',
  'app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts',
]) {
  requireText(read(file), 'isIndividualAiBillingPaused', `${file} checks current payment state`);
}

const entitlements = read('app/api/entitlements/route.ts');
requireText(entitlements, 'aiBillingPaused', 'workspace entitlement payload exposes the pause state');

const workspace = read('components/LessonWorkspace.tsx');
requireText(workspace, 'AiPaymentPauseBanner', 'lesson workspace visibly warns the user');
requireText(workspace, 'aiBillingPaused', 'lesson workspace disables AI actions');

const dashboard = read('app/lessons/page.tsx');
requireText(dashboard, 'AiPaymentPauseBanner', 'lesson dashboard visibly warns the user');

const teacherSession = read('app/sessions/[id]/page.tsx');
requireText(teacherSession, 'AiPaymentPauseBanner', 'teacher live surface visibly warns when grading is manual-only');

const subscription = read('components/SubscriptionManagement.tsx');
requireText(subscription, 'AI funkce jsou dočasně pozastavené', 'subscription page explains the payment pause');
requireText(subscription, 'automaticky odemknou', 'subscription page explains automatic unlock');

console.log('Past-due individual AI pause safeguards verified.');
