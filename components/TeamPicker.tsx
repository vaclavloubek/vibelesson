'use client';

import { useState } from 'react';
import { postLiveControlEvent } from '@/lib/live-control-client';

type Team = { id: string; name: string; memberCount: number };

type Props = {
  sessionId: string;
  teams: Team[];
  selectedTeamId: string | null;
  locked: boolean;
  onChanged: () => void;
};

export default function TeamPicker({ sessionId, teams, selectedTeamId, locked, onChanged }: Props) {
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
          throw new Error(data.error || 'Tým se nepodařilo vybrat.');
        }
        throw new TypeError(data.error || 'Primární live služba je dočasně nedostupná.');
      }
      void postLiveControlEvent(sessionId, 'student', 'student.team_selected', { teamId, source: 'primary' }, operationId);
      onChanged();
    } catch (err) {
      const fallbackOk = await postLiveControlEvent(sessionId, 'student', 'student.team_selected', { teamId, source: 'fallback' }, operationId);
      if (fallbackOk) {
        setError('Volba týmu je dočasně uložená v záložní live vrstvě a po obnovení spojení se dosynchronizuje.');
        onChanged();
      } else {
        setError(err instanceof Error ? err.message : 'Tým se nepodařilo vybrat.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!teams.length) return null;

  return (
    <section className="panel" aria-busy={busy}>
      <span className="eyebrow">Tým</span>
      <h2 style={{ marginBottom: 8 }}>{selectedTeamId ? 'Tvůj tým' : 'Vyber si tým'}</h2>
      <p className="muted-copy">
        {locked
          ? 'Po zahájení hodiny už tým změnit nejde.'
          : 'V lobby můžeš volbu ještě změnit. Po zahájení hodiny se tým zamkne.'}
      </p>
      <div style={{ display: 'grid', gap: 9, marginTop: 14 }} role="group" aria-label="Výběr týmu">
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
              <span>{team.memberCount} {team.memberCount === 1 ? 'člen' : 'členů'}</span>
            </button>
          );
        })}
      </div>
      {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
