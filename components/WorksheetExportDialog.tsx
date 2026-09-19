'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { Lesson } from '@/lib/schema';
import {
  defaultWorksheetBlockIds,
  eligibleWorksheetBlocks,
  isWorksheetRecommendedBlock,
  worksheetBlockLabel,
  type WorksheetMode,
  type WorksheetSpace,
} from '@/lib/worksheet';
import styles from './WorksheetExportDialog.module.css';

export default function WorksheetExportDialog({
  lesson,
  lessonId,
  enabled,
  loading,
}: {
  lesson: Lesson;
  lessonId: string;
  enabled: boolean;
  loading: boolean;
}) {
  const english = useUiLocale() === 'en';
  const eligibleBlocks = useMemo(() => eligibleWorksheetBlocks(lesson), [lesson]);
  const recommendedIds = useMemo(() => defaultWorksheetBlockIds(lesson), [lesson]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorksheetMode>('student');
  const [space, setSpace] = useState<WorksheetSpace>('normal');
  const [selectedIds, setSelectedIds] = useState<string[]>(recommendedIds);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSelectedIds(recommendedIds);
  }, [lessonId, recommendedIds]);

  useEffect(() => {
    if (!open) return;
    const controls = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') ?? [],
    );
    window.requestAnimationFrame(() => controls()[0]?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = controls();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function toggleBlock(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  function openPreview() {
    if (!enabled || selectedIds.length === 0) return;
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('space', space);
    for (const id of selectedIds) params.append('block', id);
    window.open('/lessons/' + encodeURIComponent(lessonId) + '/worksheet?' + params.toString(), '_blank', 'noopener,noreferrer');
    close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={'secondary ' + styles.trigger}
        disabled={loading}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {english ? 'Worksheet' : 'Pracovní list'}
        {!loading && !enabled ? <span className={styles.proBadge}>PRO</span> : null}
      </button>

      {open ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="worksheet-export-title"
            aria-describedby="worksheet-export-description"
          >
            <div className={styles.header}>
              <div>
                <span className={styles.eyebrow}>{english ? 'Print & PDF' : 'Tisk a PDF'}</span>
                <h2 id="worksheet-export-title">{english ? 'Create a worksheet' : 'Vytvořit pracovní list'}</h2>
              </div>
              <button type="button" className={styles.close} aria-label={english ? 'Close' : 'Zavřít'} onClick={close}>×</button>
            </div>

            {!enabled ? (
              <div className={styles.upgrade}>
                <p id="worksheet-export-description">
                  {english
                    ? 'Printable worksheets are included in Teacher Pro, School and Campus.'
                    : 'Pracovní listy jsou součástí tarifů Teacher Pro, School a Campus.'}
                </p>
                <Link href="/pricing#teacher-pro" className="primary button-link" onClick={close}>
                  {english ? 'View plans' : 'Zobrazit tarify'}
                </Link>
              </div>
            ) : (
              <>
                <p id="worksheet-export-description" className={styles.lead}>
                  {english
                    ? 'Choose the student version or the teacher key, select activities and open an A4 preview. Syllonaut then generates a real PDF directly for download or printing.'
                    : 'Zvolte studentskou verzi nebo klíč pro učitele, vyberte aktivity a otevřete A4 náhled. Syllonaut pak přímo vygeneruje skutečný PDF soubor pro stažení nebo tisk.'}
                </p>

                <fieldset className={styles.fieldset}>
                  <legend>{english ? 'Version' : 'Varianta'}</legend>
                  <label className={styles.choice}>
                    <input type="radio" name="worksheet-mode" checked={mode === 'student'} onChange={() => setMode('student')} />
                    <span><strong>{english ? 'For students' : 'Pro studenty'}</strong><small>{english ? 'Without answers and teacher notes' : 'Bez řešení a poznámek pro učitele'}</small></span>
                  </label>
                  <label className={styles.choice}>
                    <input type="radio" name="worksheet-mode" checked={mode === 'teacher'} onChange={() => setMode('teacher')} />
                    <span><strong>{english ? 'Teacher key' : 'Klíč pro učitele'}</strong><small>{english ? 'Answers, notes, scoring and rubrics where available' : 'Řešení, poznámky, bodování a rubriky, pokud jsou v lekci'}</small></span>
                  </label>
                </fieldset>

                <label className={styles.selectLabel}>
                  <span>{english ? 'Answer space' : 'Prostor pro odpovědi'}</span>
                  <select value={space} onChange={(event) => setSpace(event.target.value as WorksheetSpace)}>
                    <option value="compact">{english ? 'Compact' : 'Kompaktní'}</option>
                    <option value="normal">{english ? 'Standard' : 'Běžný'}</option>
                    <option value="large">{english ? 'Large' : 'Velký'}</option>
                  </select>
                </label>

                <div className={styles.activityHeading}>
                  <div>
                    <strong>{english ? 'Activities' : 'Aktivity'}</strong>
                    <span>{selectedIds.length}/{eligibleBlocks.length}</span>
                  </div>
                  <div className={styles.selectionActions}>
                    <button type="button" onClick={() => setSelectedIds(recommendedIds)}>{english ? 'Recommended' : 'Doporučené'}</button>
                    <button type="button" onClick={() => setSelectedIds(eligibleBlocks.map((block) => block.id))}>{english ? 'All' : 'Vše'}</button>
                  </div>
                </div>

                <div className={styles.activityList}>
                  {eligibleBlocks.map((block, index) => {
                    const recommended = isWorksheetRecommendedBlock(block);
                    return (
                      <label className={styles.activityChoice} key={block.id}>
                        <input type="checkbox" checked={selectedIds.includes(block.id)} onChange={() => toggleBlock(block.id)} />
                        <span className={styles.activityIndex}>{index + 1}</span>
                        <span className={styles.activityCopy}>
                          <strong>{block.title}</strong>
                          <small>{worksheetBlockLabel(block.type, english)}{recommended ? (english ? ' · recommended' : ' · doporučeno') : ''}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {lesson.blocks.some((block) => block.type === 'timer') ? (
                  <p className={styles.timerNote}>{english ? 'Timer blocks are not printed.' : 'Bloky časovače se do pracovního listu netisknou.'}</p>
                ) : null}

                <div className={styles.footer}>
                  <button type="button" className="secondary" onClick={close}>{english ? 'Cancel' : 'Zrušit'}</button>
                  <button type="button" className="primary" onClick={openPreview} disabled={selectedIds.length === 0}>
                    {english ? 'Open A4 preview' : 'Otevřít A4 náhled'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
