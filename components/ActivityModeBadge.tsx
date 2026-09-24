'use client';

import type { CSSProperties } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { LessonBlock } from '@/lib/schema';

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 'fit-content',
  border: '1px solid var(--line)',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
  color: 'var(--muted)',
  background: 'var(--panel)',
};

const answerableTypes: LessonBlock['type'][] = ['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket', 'team_task'];

function activityMode(type: LessonBlock['type'], english: boolean) {
  if (type === 'team_task') return english ? 'Team activity' : 'Týmová aktivita';
  if (type === 'intro' || type === 'reveal' || type === 'timer') return english ? 'Whole-class activity' : 'Společná aktivita';
  return english ? 'Individual activity' : 'Individuální aktivita';
}

function czechPoints(points: number) {
  if (points === 1) return 'bod';
  if (points >= 2 && points <= 4) return 'body';
  return 'bodů';
}

function activityPoints(points: number | undefined, english: boolean) {
  if (typeof points !== 'number' || points <= 0) return english ? 'Ungraded activity' : 'Nebodovaná aktivita';
  return english ? `Max. ${points} ${points === 1 ? 'point' : 'points'}` : `Max. ${points} ${czechPoints(points)}`;
}

export default function ActivityModeBadge({ type, points }: { type: LessonBlock['type']; points?: number }) {
  const english = useUiLocale() === 'en';
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <span style={badgeStyle}>{activityMode(type, english)}</span>
      {answerableTypes.includes(type) ? <span style={badgeStyle}>{activityPoints(points, english)}</span> : null}
    </span>
  );
}
