'use client';

import { useState } from 'react';
import { postLiveControlEvent } from '@/lib/live-control-client';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

type Team = { id: string; name: string; memberCount: number };

type Props = {
  sessionId: string;
  teams: Team[];
  selectedTeamId: string | null;
  locked: boolean;
  onChanged: () => void;
};

export default function TeamPicker({ sessionId, teams, selectedTeamId, locked, onChanged }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(teamId: string) {
    if (busy || (locked && selectedTeamId !== teamId)) return;
    const operationId = crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, operationId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Tým se nepodařilo vybrat.', 'The team could not be selected.'));
        }
        throw new TypeError(localizedApiError(data.error, english ? 'en' : 'cs', 'Primární live služba je dočasně nedostupná.', 'The primary live service is temporarily unavailable.'));
      }
      void postLiveControlEvent(sessionId, 'student', 'student.team_selected', { teamId, source: 'primary' }, operationId);
      onChanged();
    } catch (err) {
      const fallbackOk = await postLiveControlEvent(sessionId, 'student', 'student.team_selected', { teamId, source: 'fallback' }, operationId);
      if (fallbackOk) {
        setError(ui('Volba týmu je dočasně uložená v záložní live vrstvě a po obnovení spojení se dosynchronizuje.', 'Your team choice is temporarily stored in the fallback live layer and will resynchronise when the connection is restored.'));
        onChanged();
      } else {
        setError(err instanceof Error ? err.message : ui('Tým se nepodařilo vybrat.', 'The team could not be selected.'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!teams.length) return null;

  return (
    <section className="panel" aria-busy={busy}>
      <span className="eyebrow">{ui('Tým', 'Team')}</span>
      <h2 style={{ marginBottom: 8 }}>{selectedTeamId ? ui('Tvůj tým', 'Your team') : ui('Vyber si tým', 'Choose a team')}</h2>
      <p className="muted-copy">
        {locked
          ? ui('Po zahájení hodiny už tým změnit nejde.', 'You cannot change teams after the lesson starts.')
          : ui('V lobby můžeš volbu ještě změnit. Po zahájení hodiny se tým zamkne.', 'You can still change teams in the lobby. Your team is locked when the lesson starts.')}
      </p>
      <div style={{ display: 'grid', gap: 9, marginTop: 14 }} role="group" aria-label={ui('Výběr týmu', 'Team selection')}>
        {teams.map((team) => {
          const selected = selectedTeamId === team.id;
          return (
            <button
              key={team.id}
              type="button"
              className={selected ? 'primary' : 'secondary'}
              aria-pressed={selected}
              disabled={busy || (locked && !selected)}
              onClick={() => void choose(team.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textAlign: 'left' }}
            >
              <span>{team.name}</span>
              <span>{team.memberCount} {english ? (team.memberCount === 1 ? 'member' : 'members') : (team.memberCount === 1 ? 'člen' : 'členů')}</span>
            </button>
          );
        })}
      </div>
      {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
