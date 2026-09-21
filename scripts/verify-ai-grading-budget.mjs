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

for (const [needle, label] of [
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
]) {
  requireText(rebalance.content, needle, label);
}

const published = migrations.find(({ content }) => content.includes('Publish clear customer-facing AI grading allowances'));
if (!published) throw new Error('Missing published AI grading allowance migration.');

for (const [needle, label] of [
  ['monthly_ai_grading_count_limit = 60', 'Teacher Pro public grading allowance'],
  ['monthly_ai_grading_budget_usd = 12.00', 'Teacher Pro internal circuit breaker'],
  ['monthly_ai_grading_count_limit = 300', 'School public grading allowance'],
  ['monthly_ai_grading_budget_usd = 60.00', 'School internal circuit breaker'],
  ['monthly_ai_grading_count_limit = 750', 'Campus public grading allowance'],
  ['monthly_ai_grading_budget_usd = 150.00', 'Campus internal circuit breaker'],
  ['v_reservation numeric(12,6) := 0.100000', 'conservative in-flight grading reservation'],
  ['grading_used integer', 'quota RPC exposes grading usage'],
  ['grading_limit integer', 'quota RPC exposes grading allowance'],
  ['grading_remaining integer', 'quota RPC exposes remaining grading allowance'],
]) {
  requireText(published.content, needle, label);
}

for (const [budget, count, label] of [
  [12, 60, 'Teacher Pro'],
  [60, 300, 'School'],
  [150, 750, 'Campus'],
]) {
  if (budget < count * 0.1 * 2) {
    throw new Error(`${label} internal grading circuit breaker must retain at least 2x headroom over reserved public allowance.`);
  }
}

for (const [needle, label] of [
  ["monthly_lesson_limit = 25", 'Teacher Pro expanded lesson allowance'],
  ["monthly_revision_limit = 40", 'Teacher Pro expanded revision allowance'],
]) {
  requireText(teacherProExpansion.content, needle, label);
}

const joinLimits = migrations.find(({ content }) => content.includes('create or replace function public.enforce_participant_join_limits()'));
if (!joinLimits) throw new Error('Missing participant join-limit migration.');

for (const [needle, label] of [
  ['if v_participant_count >= 200 then', 'hard cap of 200 participants per session'],
  ['if v_recent_join_count >= 150 then', 'join burst limit of 150 per minute'],
  ['before insert on public.participants', 'join limits enforced at the insert boundary'],
]) {
  requireText(joinLimits.content, needle, label);
}

console.log(`AI grading safety budget verified via ${budget.name}; published customer allowances verified via ${published.name}; participant hard caps remain enforced at INSERT.`);
