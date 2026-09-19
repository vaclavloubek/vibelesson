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

for (const [needle, label] of [
  ["when 'teacher_pro' then 8.00", 'Teacher Pro monthly cost safety budget'],
  ["when 'teacher_pro' then 1000", 'Teacher Pro grading count ceiling'],
  ["v_reservation numeric(12,6) := 0.040000", 'conservative in-flight cost reservation'],
  ['for update of e', 'grading claims serialize on the evaluation row'],
  ['manual-budget-v1', 'budget exhaustion falls back to manual review'],
  ['private.complete_ai_grading_budget', 'finished/failed attempts settle reservations'],
]) {
  requireText(budget.content, needle, label);
}


const schoolReprice = migrations.find(({ content }) =>
  content.includes('Rebalance organization pricing economics after measuring real AI Gateway costs.')
);
if (!schoolReprice) throw new Error('Missing school-plan economics rebalance migration.');

for (const [needle, label] of [
  ["when 'team' then 60", 'Team lesson pool'],
  ["when 'school' then 150", 'School lesson pool'],
  ["when 'campus' then 400", 'Campus lesson pool'],
  ["when 'team' then 180", 'Team revision pool'],
  ["when 'school' then 300", 'School revision pool'],
  ["when 'campus' then 700", 'Campus revision pool'],
  ["when 'school' then 20.00", 'School grading safety budget'],
  ["when 'campus' then 40.00", 'Campus grading safety budget'],
  ["when 'school' then 2500", 'School grading count ceiling'],
  ["when 'campus' then 5000", 'Campus grading count ceiling'],
]) {
  requireText(schoolReprice.content, needle, label);
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

console.log(`AI grading safety budget verified via ${budget.name} + ${schoolReprice.name}; participant hard caps remain enforced at INSERT.`);
