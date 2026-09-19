'use client';

import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import type { SessionReportBlock, SessionReportData } from '@/lib/session-report';

const TYPE_LABELS = {
  cs: { poll: 'Hlasování', quiz: 'Kvíz', open_text: 'Otevřená odpověď', ranking: 'Pořadí', exit_ticket: 'Exit ticket', team_task: 'Týmový úkol' },
  en: { poll: 'Poll', quiz: 'Quiz', open_text: 'Open response', ranking: 'Ranking', exit_ticket: 'Exit ticket', team_task: 'Team task' },
} satisfies Record<'cs' | 'en', Record<SessionReportBlock['type'], string>>;

function formatDateTime(value: string | null, english: boolean) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} min ${rest} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function neutralizeCsvFormula(value: string) {
  const dangerousFormulaPrefix = /^[\u0000-\u0020\u007f-\u009f\u00a0]*[=+\-@]/;
  return dangerousFormulaPrefix.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null | undefined) {
  const rawValue = value ?? '';
  const safeValue = typeof rawValue === 'number'
    ? String(rawValue)
    : neutralizeCsvFormula(String(rawValue));
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function buildCsv(report: SessionReportData, english: boolean) {
  const participantById = new Map(report.participants.map((participant) => [participant.id, participant]));
  const rows: Array<Array<string | number | null | undefined>> = [
    english
      ? ['Block', 'Type', 'Title', 'Respondent', 'Team', 'Response', 'Note']
      : ['Blok', 'Typ', 'Název', 'Respondent', 'Tým', 'Odpověď', 'Poznámka'],
  ];

  for (const block of report.blocks) {
    if (block.kind === 'choice') {
      for (const response of block.responses) {
        const participant = participantById.get(response.participantId);
        rows.push([
          block.blockIndex,
          TYPE_LABELS[english ? 'en' : 'cs'][block.type],
          block.title,
          response.displayName,
          participant?.teamName ?? '',
          response.choice,
          block.type === 'quiz' ? (response.isCorrect ? (english ? 'correct' : 'správně') : (english ? 'incorrect' : 'špatně')) : '',
        ]);
      }
      continue;
    }

    if (block.kind === 'text') {
      for (const response of block.responses) {
        const participant = participantById.get(response.participantId);
        rows.push([
          block.blockIndex,
          TYPE_LABELS[english ? 'en' : 'cs'][block.type],
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
          TYPE_LABELS[english ? 'en' : 'cs'].ranking,
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
        TYPE_LABELS[english ? 'en' : 'cs'].team_task,
        block.title,
        response.teamName,
        response.teamName,
        response.text,
        response.updatedByDisplayName ? english ? `last edited by: ${response.updatedByDisplayName}` : `naposledy upravil/a: ${response.updatedByDisplayName}` : '',
      ]);
    }
  }

  return `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
}

function downloadCsv(report: SessionReportData, english: boolean) {
  const blob = new Blob([buildCsv(report, english)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `syllonaut-${report.joinCode}-${english ? 'results' : 'vysledky'}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SessionReport({ sessionId }: { sessionId: string }) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const labels = TYPE_LABELS[english ? 'en' : 'cs'];
  const [report, setReport] = useState<SessionReportData | null>(null);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reportViewedTrackedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/report`, { cache: 'no-store' });
        const data = await response.json() as { ready?: boolean; report?: SessionReportData; error?: string };
        if (!response.ok) throw new Error(localizedApiError(data.error, english ? 'en' : 'cs', 'Report se nepodařilo načíst.', 'The report could not be loaded.'));
        if (cancelled) return;

        if (!data.ready || !data.report) {
          retryTimer = window.setTimeout(() => void load(), 3000);
          return;
        }

        setReport(data.report);
        if (!reportViewedTrackedRef.current) {
          reportViewedTrackedRef.current = true;
          trackEvent('session_report_viewed');
        }
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : ui('Report se nepodařilo načíst.', 'The report could not be loaded.'));
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
    <div ref={rootRef} className="shell teacher-live-shell" data-tour="session-report" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <section className="panel">
          <span className="eyebrow">{ui('Výsledky mise', 'Mission results')}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginBottom: 8 }}>{report.title}</h2>
              <p className="muted-copy">{formatDateTime(report.startedAt, english)} → {formatDateTime(report.endedAt, english)} · {ui('délka', 'duration')} {formatDuration(report.durationSeconds)}</p>
            </div>
            <button className="secondary" onClick={() => { downloadCsv(report, english); trackEvent('session_csv_exported'); }}>{ui('Stáhnout CSV odpovědí', 'Download responses CSV')}</button>
          </div>
          <div className="items" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <div className="item"><span className="eyebrow">{ui('Účast', 'Participants')}</span><h2 style={{ marginBottom: 0 }}>{report.participantCount}</h2></div>
            <div className="item"><span className="eyebrow">{ui('Interaktivní bloky', 'Interactive blocks')}</span><h2 style={{ marginBottom: 0 }}>{report.answeredBlockCount} / {report.interactiveBlockCount}</h2></div>
            <div className="item"><span className="eyebrow">{ui('Uložené výstupy', 'Stored outputs')}</span><h2 style={{ marginBottom: 0 }}>{report.totalResponses}</h2></div>
          </div>
        </section>

        <details className="panel">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Účastníci', 'Participants')} · {report.participantCount}</summary>
          <div className="items" style={{ marginTop: 14 }}>
            {report.participants.map((participant) => (
              <div className="item" key={participant.id}>
                <strong>{participant.displayName}</strong>
                <p className="muted-copy" style={{ marginTop: 5 }}>{participant.teamName ?? ui('Bez týmu', 'No team')} · {ui('připojen/a', 'joined')} {formatDateTime(participant.joinedAt, english)}</p>
              </div>
            ))}
          </div>
        </details>

        {report.blocks.map((block) => (
          <section className="panel" key={block.blockId}>
            <span className="eyebrow">Blok {block.blockIndex} · {TYPE_LABELS[english ? 'en' : 'cs'][block.type]}</span>
            <h2>{block.title}</h2>
            <p className="muted-copy" style={{ marginBottom: 14 }}>{block.responseCount} {block.kind === 'team' ? ui('uložených týmových výstupů', 'stored team outputs') : ui('uložených odpovědí', 'stored responses')}</p>

            {block.kind === 'choice' ? (
              <>
                {block.type === 'quiz' ? (
                  <p className="muted-copy" style={{ marginBottom: 14 }}>
                    {ui('Správně', 'Correct')} {block.correctCount ?? 0} {ui('z', 'of')} {block.responseCount}. {ui('Správná odpověď:', 'Correct answer:')} <strong>{block.correctAnswer ?? '—'}</strong>. {block.revealed ? ui('Výsledky byly studentům zveřejněné.', 'Results were revealed to students.') : ui('Výsledky studentům zveřejněné nebyly.', 'Results were not revealed to students.')}
                  </p>
                ) : block.revealed ? <p className="muted-copy" style={{ marginBottom: 14 }}>{ui('Výsledky byly studentům zveřejněné.', 'Results were revealed to students.')}</p> : null}
                <div className="teacher-choice-results">
                  {block.options.map(({ option, count }) => {
                    const share = block.responseCount ? Math.round((count / block.responseCount) * 100) : 0;
                    const correct = block.type === 'quiz' && option === block.correctAnswer;
                    return (
                      <div className={`teacher-choice-result${correct ? ' correct' : ''}`} key={option}>
                        <div className="teacher-choice-result-head">
                          <div><strong>{option}</strong>{correct ? <span>{ui('Správná odpověď', 'Correct answer')}</span> : null}</div>
                          <strong>{count} · {share} %</strong>
                        </div>
                        <div className="teacher-choice-result-track"><div style={{ width: `${share}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
                {block.responses.length ? (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Jednotlivé odpovědi', 'Individual responses')}</summary>
                    <div className="teacher-response-list" style={{ marginTop: 10 }}>
                      {block.responses.map((response) => (
                        <div className="item teacher-response-item answered" key={response.participantId}>
                          <strong>{response.displayName}</strong>
                          <p style={{ marginBottom: 0 }}>{response.choice}{block.type === 'quiz' ? ` · ${response.isCorrect ? (english ? 'correct' : 'správně') : (english ? 'incorrect' : 'špatně')}` : ''}</p>
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
              ) : <p className="muted-copy">{ui('Bez odpovědí.', 'No responses.')}</p>
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
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{ui('Individuální pořadí a zdůvodnění', 'Individual rankings and reasoning')}</summary>
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
                        <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Naposledy upravil/a', 'Last edited by')}: {response.updatedByDisplayName ?? ui('člen týmu', 'team member')}</p>
                      </>
                    ) : <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Bez odevzdaného výstupu.', 'No submitted output.')}</p>}
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
