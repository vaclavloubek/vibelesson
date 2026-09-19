'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { signalSyllonautGuideAction } from '@/lib/onboarding-guide';
import GuideHelpButton from '@/components/GuideHelpButton';

type Props = {
  lessonId: string;
  userId: string;
  liveLocked?: boolean;
  licenseLocked?: boolean;
  organizationName?: string | null;
};

export default function StartSessionButton({
  lessonId,
  userId,
  liveLocked = false,
  licenseLocked = false,
  organizationName = null,
}: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  async function start() {
    if (busy || liveLocked || licenseLocked) return;
    setBusy(true);
    setError('');
    setActiveSessionId(null);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      });
      const data = await response.json() as { sessionId?: string; activeSessionId?: string; error?: string; code?: string };
      if (!response.ok || !data.sessionId) {
        if (response.status === 409 && data.activeSessionId) {
          setActiveSessionId(data.activeSessionId);
          setError(ui('Na tomto účtu už běží jiná hodina.', 'Another live lesson is already running on this account.'));
          setBusy(false);
          return;
        }
        if (response.status === 403 && data.code === 'free_lesson_replay_locked') {
          throw new Error(ui(
            'Tuto lekci už jsi ve Free tarifu použil. Další živé použití odemkne placený tarif.',
            'You have already used this lesson on the Free plan. A paid plan unlocks repeated live use.',
          ));
        }
        throw new Error(english ? 'The lesson could not be started.' : (data.error || 'Hodinu se nepodařilo odstartovat.'));
      }
      trackEvent('live_session_created');
      signalSyllonautGuideAction(userId, 'session-created');
      router.push(`/sessions/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Hodinu se nepodařilo odstartovat.', 'The lesson could not be started.'));
      setBusy(false);
    }
  }

  if (licenseLocked) {
    return (
      <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, display: 'grid', justifyItems: 'end', gap: 8, maxWidth: 380 }}>
        <div className="panel" style={{ padding: 16, boxShadow: '0 12px 30px rgba(24,24,23,.14)' }}>
          <span className="eyebrow">{ui('Školní licence neaktivní', 'School licence inactive')}</span>
          <p style={{ margin: '6px 0 0' }}>
            {organizationName
              ? ui(
                  `Tato lekce pochází z knihovny organizace „${organizationName}“. Spuštění se odemkne po obnovení aktivního přístupu k této organizaci.`,
                  `This lesson comes from the ${organizationName} library. Starting it unlocks when your access to that organisation becomes active again.`,
                )
              : ui(
                  'Tato lekce pochází ze školní knihovny. Spuštění se odemkne po obnovení aktivního přístupu k původní organizaci.',
                  'This lesson comes from a school library. Starting it unlocks when access to the originating organisation becomes active again.',
                )}
          </p>
        </div>
      </div>
    );
  }

  if (liveLocked) {
    return (
      <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, display: 'grid', justifyItems: 'end', gap: 8, maxWidth: 360 }}>
        <div className="panel" style={{ padding: 16, boxShadow: '0 12px 30px rgba(24,24,23,.14)' }}>
          <span className="eyebrow">{ui('Archivovaná lekce', 'Archived lesson')}</span>
          <p style={{ margin: '6px 0 12px' }}>
            {ui(
              'Ve Free tarifu už proběhlo její první živé použití. Lekci můžeš dál libovolně upravovat ručně i pomocí AI v rámci svého měsíčního limitu.',
              'Its first live use on the Free plan is complete. You can still edit the lesson freely, including with AI within your monthly allowance.',
            )}
          </p>
          <Link href={`/${locale}/pricing`} className="primary button-link">
            {ui('Odemknout opakované použití', 'Unlock repeated use')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, display: 'grid', justifyItems: 'end', gap: 8 }}>
      {error ? <div className="error" style={{ maxWidth: 320 }}>{error}</div> : null}
      {activeSessionId ? (
        <button type="button" className="secondary" onClick={() => router.push(`/sessions/${activeSessionId}`)}>
          {ui('Otevřít rozběhnutou hodinu', 'Open the active lesson')}
        </button>
      ) : null}
      <div className="syllonaut-guide-help-cluster">
        <GuideHelpButton userId={userId} chapter="lesson" step={6} labelCs="Jak spustit hodinu" labelEn="How to start a lesson" />
        <button type="button" className="primary" data-tour="lesson-start" onClick={() => void start()} disabled={busy} style={{ padding: '14px 20px', boxShadow: '0 12px 30px rgba(24,24,23,.18)' }}>{busy ? ui('Připravuji start…', 'Preparing lesson…') : ui('Odstartovat hodinu', 'Start lesson')}</button>
      </div>
    </div>
  );
}
