import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing AI grading safety safeguard: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, content: read(path.join('supabase/migrations', name)) }));

const budget = migrations.find(({ content }) => content.includes('create table if not exists private.ai_grading_budget_requests'));
if (!budget) throw new Error('Missing AI grading safety-budget migration.');
const rebalance = migrations.find(({ content }) => content.includes('Measured unit economics baseline 2026-09-20'));
if (!rebalance) throw new Error('Missing measured plan-economics rebalance migration.');
const teacherProExpansion = migrations.find(({ content }) => content.includes('Teacher Pro allowance expansion 2026-09-20'));
if (!teacherProExpansion) throw new Error('Missing Teacher Pro 25+40 allowance migration.');
const publishedAllowance = migrations.find(({ content }) => content.includes("when 'teacher_pro' then 60")
  && content.includes("when 'school' then 300")
  && content.includes("when 'campus' then 750")
  && content.includes('grading_enabled boolean'));
if (!publishedAllowance) throw new Error('Missing published AI grading allowance migration.');

for (const [needle, label] of [
  ["v_reservation numeric(12,6) := 0.040000", 'conservative in-flight cost reservation'],
  ['for update of e', 'grading claims serialize on the evaluation row'],
  ['manual-budget-v1', 'budget exhaustion falls back to manual review'],
  ['private.complete_ai_grading_budget', 'finished/failed attempts settle reservations'],
]) {
  requireText(budget.content, needle, label);
}

for (const [needle, label] of [
  ["('free', 5, 10", 'Free measured-cost limits'],
  ["('teacher', 10, 20", 'Teacher measured-cost limits'],
  ["('teacher_pro', 20, 25", 'Teacher Pro measured-cost baseline'],
  ["('team', 40, 80", 'Team measured-cost limits'],
  ["('school', 120, 240", 'School measured-cost limits'],
  ["('campus', 300, 600", 'Campus measured-cost limits'],
  ["when 'teacher_pro' then 2.00", 'historical Teacher Pro grading budget baseline'],
  ["when 'school' then 10.00", 'historical School grading budget baseline'],
  ["when 'campus' then 25.00", 'historical Campus grading budget baseline'],
  ["when 'teacher_pro' then 150", 'historical Teacher Pro grading ceiling'],
  ["when 'school' then 700", 'historical School grading ceiling'],
  ["when 'campus' then 1750", 'historical Campus grading ceiling'],
]) {
  requireText(rebalance.content, needle, label);
}

for (const [needle, label] of [
  ["monthly_lesson_limit = 25", 'Teacher Pro expanded lesson allowance'],
  ["monthly_revision_limit = 40", 'Teacher Pro expanded revision allowance'],
]) {
  requireText(teacherProExpansion.content, needle, label);
}

for (const [needle, label] of [
  ["when 'teacher_pro' then 60", 'Teacher Pro customer grading allowance'],
  ["when 'school' then 300", 'School customer grading allowance'],
  ["when 'campus' then 750", 'Campus customer grading allowance'],
  ["when 'teacher_pro' then 12.00", 'Teacher Pro emergency cost guard'],
  ["when 'school' then 60.00", 'School emergency cost guard'],
  ["when 'campus' then 150.00", 'Campus emergency cost guard'],
  ["v_reservation numeric(12,6) := 0.100000", 'conservative published-period reservation'],
  ['from private.individual_ai_quota_window(v_user_id, now()) q', 'Teacher Pro grading uses billing-anchored quota window'],
  ['grading_used integer', 'quota RPC exposes grading usage'],
  ['grading_limit integer', 'quota RPC exposes grading limit'],
  ['grading_remaining integer', 'quota RPC exposes grading remaining'],
]) {
  requireText(publishedAllowance.content, needle, label);
}

const allowanceSource = read('lib/ai-grading-allowances.ts');
const pricingSource = read('components/PricingPage.tsx');
const accountMenuSource = read('components/PublicHeaderAccountMenu.tsx');
const emailCoreSource = read('lib/billing-email-core.ts');

for (const [needle, label] of [
  ['teacher_pro: 60', 'shared Teacher Pro grading allowance'],
  ['school: 300', 'shared School grading allowance'],
  ['campus: 750', 'shared Campus grading allowance'],
]) {
  requireText(allowanceSource, needle, label);
}

requireText(pricingSource, 'AI_GRADING_ALLOWANCES.teacher_pro', 'Pricing uses shared Teacher Pro grading allowance');
requireText(pricingSource, 'AI_GRADING_ALLOWANCES.school', 'Pricing uses shared School grading allowance');
requireText(pricingSource, 'AI_GRADING_ALLOWANCES.campus', 'Pricing uses shared Campus grading allowance');
requireText(accountMenuSource, 'grading_remaining', 'account menu displays remaining grading quota');
requireText(emailCoreSource, 'allowance.aiGradings', 'activation email confirms grading allowance');

const joinLimits = migrations.find(({ content }) => content.includes('create or replace function public.enforce_participant_join_limits()'));
if (!joinLimits) throw new Error('Missing participant join-limit migration.');

for (const [needle, label] of [
  ['if v_participant_count >= 200 then', 'hard cap of 200 participants per session'],
  ['if v_recent_join_count >= 150 then', 'join burst limit of 150 per minute'],
  ['before insert on public.participants', 'join limits enforced at the insert boundary'],
]) {
  requireText(joinLimits.content, needle, label);
}

console.log(`AI grading safety budget verified via ${budget.name}; published customer allowances verified via ${publishedAllowance.name}; participant hard caps remain enforced at INSERT.`);
