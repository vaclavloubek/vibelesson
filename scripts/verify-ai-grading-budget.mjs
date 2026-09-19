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
  ["when 'school' then 75.00", 'School monthly cost safety budget'],
  ["when 'campus' then 200.00", 'Campus monthly cost safety budget'],
  ["when 'teacher_pro' then 1000", 'Teacher Pro grading count ceiling'],
  ["when 'school' then 7500", 'School grading count ceiling'],
  ["when 'campus' then 20000", 'Campus grading count ceiling'],
  ["v_reservation numeric(12,6) := 0.040000", 'conservative in-flight cost reservation'],
  ['for update of e', 'grading claims serialize on the evaluation row'],
  ['manual-budget-v1', 'budget exhaustion falls back to manual review'],
  ['private.complete_ai_grading_budget', 'finished/failed attempts settle reservations'],
]) {
  requireText(budget.content, needle, label);
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

console.log(`AI grading safety budget verified via ${budget.name}; participant hard caps remain enforced at INSERT.`);
