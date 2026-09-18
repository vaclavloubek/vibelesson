'use client';

import { useUiLocale } from '@/components/LocaleProvider';
import type { LessonBlock } from '@/lib/schema';

function activityMode(type: LessonBlock['type'], english: boolean) {
  if (type === 'team_task') return english ? 'Team activity' : 'Týmová aktivita';
  if (type === 'intro' || type === 'reveal' || type === 'timer') return english ? 'Whole-class activity' : 'Společná aktivita';
  return english ? 'Individual activity' : 'Individuální aktivita';
}

export default function ActivityModeBadge({ type }: { type: LessonBlock['type'] }) {
  const english = useUiLocale() === 'en';
  return (
    <span
      style={{
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
      }}
    >
      {activityMode(type, english)}
    </span>
  );
}
