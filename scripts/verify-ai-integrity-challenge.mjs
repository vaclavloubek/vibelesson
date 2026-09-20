import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) throw new Error(`Missing AI integrity safeguard: ${label}`);
};

const grading = read('lib/grading.ts');
for (const [needle, label] of [
  ["suspicion: z.enum(['none', 'low', 'high'])", 'three-level suspicion signal'],
  ['Integritní posouzení je ODDĚLENÉ od bodového hodnocení', 'no automatic score penalty rule'],
  ['Samotná plynulost, spisovnost, délka', 'false-positive guard'],
  ["needsReview: output.confidence < 0.7 || suspicion === 'high'", 'high suspicion review routing'],
]) requireText(grading, needle, label);

const migration = read('supabase/migrations/20260920195500_add_ai_integrity_challenges.sql');
for (const [needle, label] of [
  ["check (ai_suspicion in ('none', 'low', 'high'))", 'database suspicion constraint'],
  ["integrity_challenge_status in ('not_required', 'pending', 'answered', 'expired')", 'challenge state constraint'],
  ["integrity_challenge_presented_at", 'timer starts on presentation'],
  ["then 'pending'", 'high-suspicion individual challenge'],
  ["new.status := 'needs_review'", 'database-enforced teacher review'],
  ["new.status = 'failed'", 'failed grading challenge cleanup'],
]) requireText(migration, needle, label);

const edge = read('supabase/functions/student-session/index.ts');
for (const [needle, label] of [
  ['action === "integrity_challenge"', 'participant challenge submission action'],
  ['Date.now() + 60_000', '60-second countdown'],
  ['integrity_challenge_presented_at', 'first-presentation timestamp'],
  ['integrity_challenge_status: "answered"', 'challenge answer persistence'],
]) requireText(edge, needle, label);

const student = read('components/IntegrityChallengeCard.tsx');
requireText(student, 'Rychlé ověření porozumění', 'neutral student-facing challenge');
requireText(student, 'remaining', 'visible countdown');

const teacher = read('components/EvaluationReviewQueue.tsx');
requireText(teacher, 'Toto není důkaz ani automatický trest.', 'teacher false-positive warning');
requireText(teacher, 'Potvrdit nepovolené využití AI → 0 bodů', 'explicit teacher-only zero action');

const queue = read('app/api/sessions/[id]/evaluations/queue/route.ts');
requireText(queue, 'ai_suspicion_reasons', 'teacher integrity evidence payload');

console.log('AI integrity challenge safeguards verified.');
