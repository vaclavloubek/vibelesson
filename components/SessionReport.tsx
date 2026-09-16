'use client';

import { useEffect, useRef, useState } from 'react';
import type { SessionReportBlock, SessionReportData } from '@/lib/session-report';

const TYPE_LABELS: Record<SessionReportBlock['type'], string> = {
  poll: 'Hlasování',
  quiz: 'Kvíz',
  open_text: 'Otevřená odpověď',
  ranking: 'Pořadí',
  exit_ticket: 'Exit ticket',
  team_task: 'Týmový úkol',
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} min ${rest} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function buildCsv(report: SessionReportData) {
  const participantById = new Map(report.participants.map((participant) => [participant.id, participant]));
  const rows: Array<Array<string | number | null | undefined>> = [
    ['Blok', 'Typ', 'Název', 'Respondent', 'Tým', 'Odpověď', 'Poznámka'],
  ];

  for (const block of report.blocks) {
    if (block.kind === 'choice') {
      for (const response of block.responses) {
        const participant = participantById.get(response.participantId);
        rows.push([
          block.blockIndex,
          TYPE_LABELS[block.type],
          block.title,
          response.displayName,
          participant?.teamName ?? '',
          response.choice,
          block.type === 'quiz' ? (response.isCorrect ? 'správně' : 'špatně') : '',
        ]);
      }
      continue;
    }

    if (block.kind === 'text') {
      for (const response of block.responses) {
        const participant = participantById.get(response.participantId);
        rows.push([
          block.blockIndex,
          TYPE_LABELS[block.type],
          block.title,
          response.displayName,
          participant?.teamName ?? '',
          response.text,
          '',
        ]);
      }
      continue;
    }

    if (block.kind === 'ranking') {
      for (const response of block.responses) {
        const participant = participantById.get(response.participantId);
        rows.push([
          block.blockIndex,
          TYPE_LABELS.ranking,
          block.title,
          response.displayName,
          participant?.teamName ?? '',
          response.ranking.join(' > '),
          response.text,
        ]);
      }
      continue;
    }

    for (const response of block.responses) {
      if (!response.text) continue;
      rows.push([
        block.blockIndex,
        TYPE_LABELS.team_task,
        block.title,
        response.teamName,
        response.teamName,
        response.text,
        response.updatedByDisplayName ? `naposledy upravil/a: ${response.updatedByDisplayName}` : '',
      ]);
    }
  }

  return `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
}

function downloadCsv(report: SessionReportData) {
  const blob = new Blob([buildCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `syllonaut-${report.joinCode}-vysledky.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SessionReport({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<SessionReportData | null>(null);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/report`, { cache: 'no-store' });
        const data = await response.json() as { ready?: boolean; report?: SessionReportData; error?: string };
        if (!response.ok) throw new Error(data.error || 'Report se nepodařilo načíst.');
        if (cancelled) return;

        if (!data.ready || !data.report) {
          retryTimer = window.setTimeout(() => void load(), 3000);
          return;
        }

        setReport(data.report);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Report se nepodařilo načíst.');
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!report && !error) return;
    const frame = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [report, error]);

  if (!report && !error) return null;

  if (error) {
    return (
      <div ref={rootRef} className="shell teacher-live-shell" style={{ paddingTop: 0 }}>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div ref={rootRef} className="shell teacher-live-shell" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <section className="panel">
          <span className="eyebrow">Výsledky mise</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginBottom: 8 }}>{report.title}</h2>
              <p className="muted-copy">{formatDateTime(report.startedAt)} → {formatDateTime(report.endedAt)} · délka {formatDuration(report.durationSeconds)}</p>
            </div>
            <button className="secondary" onClick={() => downloadCsv(report)}>Stáhnout CSV odpovědí</button>
          </div>
          <div className="items" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <div className="item"><span className="eyebrow">Účast</span><h2 style={{ marginBottom: 0 }}>{report.participantCount}</h2></div>
            <div className="item"><span className="eyebrow">Interaktivní bloky</span><h2 style={{ marginBottom: 0 }}>{report.answeredBlockCount} / {report.interactiveBlockCount}</h2></div>
            <div className="item"><span className="eyebrow">Uložené výstupy</span><h2 style={{ marginBottom: 0 }}>{report.totalResponses}</h2></div>
          </div>
        </section>

        <details className="panel">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Účastníci · {report.participantCount}</summary>
          <div className="items" style={{ marginTop: 14 }}>
            {report.participants.map((participant) => (
              <div className="item" key={participant.id}>
                <strong>{participant.displayName}</strong>
                <p className="muted-copy" style={{ marginTop: 5 }}>{participant.teamName ?? 'Bez týmu'} · připojen/a {formatDateTime(participant.joinedAt)}</p>
              </div>
            ))}
          </div>
        </details>

        {report.blocks.map((block) => (
          <section className="panel" key={block.blockId}>
            <span className="eyebrow">Blok {block.blockIndex} · {TYPE_LABELS[block.type]}</span>
            <h2>{block.title}</h2>
            <p className="muted-copy" style={{ marginBottom: 14 }}>{block.responseCount} uložených {block.kind === 'team' ? 'týmových výstupů' : 'odpovědí'}</p>

            {block.kind === 'choice' ? (
              <>
                {block.type === 'quiz' ? (
                  <p className="muted-copy" style={{ marginBottom: 14 }}>
                    Správně {block.correctCount ?? 0} z {block.responseCount}. Správná odpověď: <strong>{block.correctAnswer ?? '—'}</strong>. {block.revealed ? 'Výsledky byly studentům zveřejněné.' : 'Výsledky studentům zveřejněné nebyly.'}
                  </p>
                ) : block.revealed ? <p className="muted-copy" style={{ marginBottom: 14 }}>Výsledky byly studentům zveřejněné.</p> : null}
                <div className="teacher-choice-results">
                  {block.options.map(({ option, count }) => {
                    const share = block.responseCount ? Math.round((count / block.responseCount) * 100) : 0;
                    const correct = block.type === 'quiz' && option === block.correctAnswer;
                    return (
                      <div className={`teacher-choice-result${correct ? ' correct' : ''}`} key={option}>
                        <div className="teacher-choice-result-head">
                          <div><strong>{option}</strong>{correct ? <span>Správná odpověď</span> : null}</div>
                          <strong>{count} · {share} %</strong>
                        </div>
                        <div className="teacher-choice-result-track"><div style={{ width: `${share}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
                {block.responses.length ? (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Jednotlivé odpovědi</summary>
                    <div className="teacher-response-list" style={{ marginTop: 10 }}>
                      {block.responses.map((response) => (
                        <div className="item teacher-response-item answered" key={response.participantId}>
                          <strong>{response.displayName}</strong>
                          <p style={{ marginBottom: 0 }}>{response.choice}{block.type === 'quiz' ? ` · ${response.isCorrect ? 'správně' : 'špatně'}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}

            {block.kind === 'text' ? (
              block.responses.length ? (
                <div className="teacher-response-list">
                  {block.responses.map((response) => (
                    <div className="item teacher-response-item answered" key={response.participantId}>
                      <strong>{response.displayName}</strong>
                      <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.text}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="muted-copy">Bez odpovědí.</p>
            ) : null}

            {block.kind === 'ranking' ? (
              <>
                <div className="teacher-ranking-results">
                  {block.ranking.map(({ item, average, sourceIndex }, index) => (
                    <div className={`ranking-item ranking-item-tone-${sourceIndex % 5}`} key={item}>
                      <strong className="ranking-position">{index + 1}.</strong>
                      <strong className="ranking-copy">{item}</strong>
                      <span className="teacher-ranking-average">{average === null ? '—' : `Ø ${average.toFixed(1)}`}</span>
                    </div>
                  ))}
                </div>
                {block.responses.length ? (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Individuální pořadí a zdůvodnění</summary>
                    <div className="teacher-response-list" style={{ marginTop: 10 }}>
                      {block.responses.map((response) => (
                        <div className="item teacher-response-item answered" key={response.participantId}>
                          <strong>{response.displayName}</strong>
                          <p className="muted-copy" style={{ marginTop: 6 }}>{response.ranking.join(' → ')}</p>
                          <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{response.text}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}

            {block.kind === 'team' ? (
              <div className="teacher-response-list">
                {block.responses.map((response) => (
                  <div className={`item teacher-response-item${response.text ? ' answered' : ''}`} key={response.teamId}>
                    <strong>{response.teamName}</strong>
                    {response.text ? (
                      <>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{response.text}</p>
                        <p className="muted-copy" style={{ marginBottom: 0 }}>Naposledy upravil/a: {response.updatedByDisplayName ?? 'člen týmu'}</p>
                      </>
                    ) : <p className="muted-copy" style={{ marginBottom: 0 }}>Bez odevzdaného výstupu.</p>}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
