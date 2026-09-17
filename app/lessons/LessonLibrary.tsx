'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import LessonActions from './LessonActions';
import styles from './LessonLibrary.module.css';

export type LessonListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  audience: string;
  totalMinutes: number;
  blockCount: number;
  updatedAt: string;
  folderId: string | null;
};

export type LessonFolderItem = {
  id: string;
  name: string;
  parentId: string | null;
};

type Props = {
  lessons: LessonListItem[];
  folders: LessonFolderItem[];
  canManageFolders: boolean;
};

type Scope = 'all' | 'unfiled' | string;
type DropTarget = 'unfiled' | string | null;
type MoveDialogState = {
  lessonIds: string[];
  label: string;
  currentFolderId?: string | null;
};

const MOVE_DIALOG_TITLE_ID = 'move-dialog-title';

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export default function LessonLibrary({ lessons, folders, canManageFolders }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const moveDialogRef = useRef<HTMLDivElement | null>(null);
  const moveDialogTriggerRef = useRef<HTMLElement | null>(null);

  function closeMoveDialog() {
    setMoveDialog(null);
    window.requestAnimationFrame(() => moveDialogTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!moveDialog) return;

    const frame = window.requestAnimationFrame(() => {
      moveDialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        closeMoveDialog();
        return;
      }
      if (event.key !== 'Tab' || !moveDialogRef.current) return;

      const focusable = Array.from(moveDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
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

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [busy, moveDialog]);

  const roots = useMemo(
    () => folders.filter((folder) => !folder.parentId).sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [folders],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, LessonFolderItem[]>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    return map;
  }, [folders]);

  const visibleLessons = useMemo(() => {
    if (!canManageFolders || scope === 'all') return lessons;
    if (scope === 'unfiled') return lessons.filter((lesson) => !lesson.folderId);
    return lessons.filter((lesson) => lesson.folderId === scope);
  }, [canManageFolders, lessons, scope]);

  const activeFolder = folders.find((folder) => folder.id === scope) ?? null;
  const newLessonHref = activeFolder ? `/new?folder=${encodeURIComponent(activeFolder.id)}` : '/new';

  function lessonCount(folderId: string | null) {
    return lessons.filter((lesson) => lesson.folderId === folderId).length;
  }

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function requestJson(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json() as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Operace se nepodařila.');
    return data;
  }

  async function createFolder(parentId: string | null) {
    const parent = parentId ? folders.find((folder) => folder.id === parentId) : null;
    const name = window.prompt(parent ? `Název podsložky ve „${parent.name}“:` : 'Název nové složky:')?.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Složku se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(folder: LessonFolderItem) {
    const name = window.prompt('Nový název složky:', folder.name)?.trim();
    if (!name || name === folder.name) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Složku se nepodařilo přejmenovat.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(folder: LessonFolderItem) {
    if ((childrenByParent.get(folder.id) ?? []).length) {
      setError('Nejdřív smaž podsložky. Smazání nadřazené složky se záměrně neprovádí automaticky.');
      return;
    }
    if (!window.confirm(`Smazat složku „${folder.name}“? Lekce se nesmažou, přesunou se do „Bez složky“.`)) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (scope === folder.id) setScope('unfiled');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Složku se nepodařilo smazat.');
    } finally {
      setBusy(false);
    }
  }

  async function moveLessons(lessonIds: string[], folderId: string | null) {
    if (!lessonIds.length) return;
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/lessons/move', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds, folderId }),
      });
      setSelectedLessonIds([]);
      if (moveDialog) closeMoveDialog();
      if (selectionMode) setSelectionMode(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lekce se nepodařilo přesunout.');
    } finally {
      setBusy(false);
    }
  }

  function rememberMoveTrigger() {
    moveDialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function openSingleMove(lesson: LessonListItem) {
    rememberMoveTrigger();
    setError('');
    setMoveDialog({ lessonIds: [lesson.id], label: lesson.title, currentFolderId: lesson.folderId });
  }

  function openBulkMove() {
    if (!selectedLessonIds.length) return;
    rememberMoveTrigger();
    setError('');
    setMoveDialog({
      lessonIds: selectedLessonIds,
      label: `${selectedLessonIds.length} ${selectedLessonIds.length === 1 ? 'lekce' : selectedLessonIds.length < 5 ? 'lekce' : 'lekcí'}`,
    });
  }

  function startDragging(event: React.DragEvent<HTMLElement>, lessonId: string) {
    if (selectionMode || busy) {
      event.preventDefault();
      return;
    }
    setDraggingLessonId(lessonId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', lessonId);
  }

  function allowDrop(event: React.DragEvent<HTMLElement>, target: DropTarget) {
    if (!draggingLessonId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }

  async function dropLesson(event: React.DragEvent<HTMLElement>, folderId: string | null) {
    event.preventDefault();
    const lessonId = draggingLessonId || event.dataTransfer.getData('text/plain');
    setDraggingLessonId(null);
    setDropTarget(null);
    if (!lessonId) return;
    const lesson = lessons.find((item) => item.id === lessonId);
    if (lesson && lesson.folderId === folderId) return;
    await moveLessons([lessonId], folderId);
  }

  function endDragging() {
    setDraggingLessonId(null);
    setDropTarget(null);
  }

  function isCurrentMoveTarget(folderId: string | null) {
    return moveDialog?.currentFolderId !== undefined && moveDialog.currentFolderId === folderId;
  }

  function renderFolderNavigation() {
    return (
      <nav className={styles.folderNavigation} aria-label="Složky lekcí">
        <div className={styles.folderNavTop}>
          <strong>Složky</strong>
          <button type="button" onClick={() => createFolder(null)} disabled={busy}>+ Složka</button>
        </div>
        <button type="button" aria-pressed={scope === 'all'} className={scope === 'all' ? styles.scopeActive : styles.scopeButton} onClick={() => setScope('all')}>
          <span>Všechny lekce</span><small>{lessons.length}</small>
        </button>
        <button
          type="button"
          aria-pressed={scope === 'unfiled'}
          className={`${scope === 'unfiled' ? styles.scopeActive : styles.scopeButton} ${dropTarget === 'unfiled' ? styles.dropTarget : ''}`}
          onClick={() => setScope('unfiled')}
          onDragOver={(event) => allowDrop(event, 'unfiled')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => dropLesson(event, null)}
        >
          <span>Bez složky</span><small>{lessonCount(null)}</small>
        </button>
        <div className={styles.folderTree}>
          {roots.map((root) => (
            <div key={root.id}>
              <div
                className={`${styles.folderRow} ${dropTarget === root.id ? styles.dropTargetRow : ''}`}
                onDragOver={(event) => allowDrop(event, root.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => dropLesson(event, root.id)}
              >
                <button type="button" aria-pressed={scope === root.id} className={scope === root.id ? styles.folderActive : styles.folderButton} onClick={() => setScope(root.id)}>
                  <span>{root.name}</span><small>{lessonCount(root.id)}</small>
                </button>
                <div className={styles.folderActions}>
                  <button type="button" title="Přidat podsložku" aria-label={`Přidat podsložku do ${root.name}`} onClick={() => createFolder(root.id)} disabled={busy}>+</button>
                  <button type="button" title="Přejmenovat" aria-label={`Přejmenovat složku ${root.name}`} onClick={() => renameFolder(root)} disabled={busy}>✎</button>
                  <button type="button" title="Smazat" aria-label={`Smazat složku ${root.name}`} onClick={() => deleteFolder(root)} disabled={busy}>×</button>
                </div>
              </div>
              {(childrenByParent.get(root.id) ?? []).map((child) => (
                <div
                  className={`${styles.folderRow} ${styles.childFolder} ${dropTarget === child.id ? styles.dropTargetRow : ''}`}
                  key={child.id}
                  onDragOver={(event) => allowDrop(event, child.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => dropLesson(event, child.id)}
                >
                  <button type="button" aria-pressed={scope === child.id} className={scope === child.id ? styles.folderActive : styles.folderButton} onClick={() => setScope(child.id)}>
                    <span>{child.name}</span><small>{lessonCount(child.id)}</small>
                  </button>
                  <div className={styles.folderActions}>
                    <button type="button" title="Přejmenovat" aria-label={`Přejmenovat složku ${child.name}`} onClick={() => renameFolder(child)} disabled={busy}>✎</button>
                    <button type="button" title="Smazat" aria-label={`Smazat složku ${child.name}`} onClick={() => deleteFolder(child)} disabled={busy}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {lessons.length > 0 ? <p className={styles.dragHint}>Na počítači můžeš lekci přetáhnout přímo do složky. Stejný přesun je vždy dostupný i přes nabídku lekce „Přesunout do…“.</p> : null}
      </nav>
    );
  }

  if (!canManageFolders) {
    return (
      <section className="lesson-grid">
        {lessons.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div className="lesson-card-top"><div><Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div><LessonActions lessonId={lesson.id} title={lesson.title} /></div>
            <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} aktivit</span></div>
            <div className="lesson-card-footer"><span>Upraveno {formatUpdatedAt(lesson.updatedAt)}</span><Link href={`/lessons/${lesson.id}`} className="auth-link">Otevřít</Link></div>
          </article>
        ))}
      </section>
    );
  }

  return (
    <section className={styles.libraryLayout} aria-busy={busy}>
      <aside className={styles.sidebar}>{renderFolderNavigation()}</aside>
      <div className={styles.libraryMain}>
        <details className={styles.mobileFolders}>
          <summary>Složky</summary>
          {renderFolderNavigation()}
        </details>

        <div className={styles.libraryToolbar}>
          <div>
            <span className="eyebrow">{activeFolder ? 'Vybraná složka' : scope === 'unfiled' ? 'Bez složky' : 'Knihovna'}</span>
            <h2>{activeFolder?.name ?? (scope === 'unfiled' ? 'Bez složky' : 'Všechny lekce')}</h2>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className="secondary" aria-pressed={selectionMode} onClick={() => { setSelectionMode((value) => !value); setSelectedLessonIds([]); }} disabled={busy}>
              {selectionMode ? 'Hotovo' : 'Vybrat'}
            </button>
            <Link href={newLessonHref} className="primary button-link">{activeFolder ? '+ Nová lekce v této složce' : '+ Nová lekce'}</Link>
          </div>
        </div>

        {selectionMode ? (
          <div className={styles.bulkToolbar} role="group" aria-label="Hromadný přesun lekcí">
            <strong>Vybráno: {selectedLessonIds.length}</strong>
            <button type="button" className="secondary" onClick={openBulkMove} disabled={busy || selectedLessonIds.length === 0}>Přesunout do…</button>
          </div>
        ) : null}

        {error ? <div className="error" role="alert">{error}</div> : null}

        {visibleLessons.length === 0 ? (
          <div className={`panel ${styles.emptyFolder}`}>
            <h3>{lessons.length === 0 ? 'Zatím tu není žádná lekce' : 'Tahle složka je zatím prázdná'}</h3>
            <p>{lessons.length === 0 ? 'Vytvoř první lekci nebo si nejdřív připrav strukturu složek.' : 'Přesuň sem existující lekce nebo vytvoř novou rovnou v této složce.'}</p>
          </div>
        ) : (
          <div className="lesson-grid">
            {visibleLessons.map((lesson) => (
              <article
                className={`lesson-card ${styles.draggableCard} ${draggingLessonId === lesson.id ? styles.draggingCard : ''}`}
                key={lesson.id}
                draggable={!selectionMode && !busy}
                onDragStart={(event) => startDragging(event, lesson.id)}
                onDragEnd={endDragging}
              >
                <div className="lesson-card-top">
                  <div className={styles.cardTitleWrap}>
                    {selectionMode ? <input type="checkbox" checked={selectedLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} aria-label={`Vybrat lekci ${lesson.title}`} /> : null}
                    <div><Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div>
                  </div>
                  <LessonActions lessonId={lesson.id} title={lesson.title} onMove={() => openSingleMove(lesson)} moveDisabled={selectionMode || busy} />
                </div>
                <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} aktivit</span></div>
                <div className={`lesson-card-footer ${styles.cardFooter}`}>
                  <span>Upraveno {formatUpdatedAt(lesson.updatedAt)}</span>
                  <Link href={`/lessons/${lesson.id}`} className="auth-link">Otevřít</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {moveDialog ? (
        <div className={styles.dialogBackdrop} onMouseDown={() => { if (!busy) closeMoveDialog(); }}>
          <div
            ref={moveDialogRef}
            className={styles.moveDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={MOVE_DIALOG_TITLE_ID}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className="eyebrow">Organizace knihovny</span>
                <h3 id={MOVE_DIALOG_TITLE_ID}>Přesunout do…</h3>
                <p>{moveDialog.label}</p>
              </div>
              <button type="button" className={styles.dialogClose} aria-label="Zavřít dialog přesunu" onClick={closeMoveDialog} disabled={busy}>×</button>
            </div>

            <div className={styles.moveFolderList}>
              <button
                type="button"
                className={`${styles.moveFolderButton} ${isCurrentMoveTarget(null) ? styles.currentMoveFolder : ''}`}
                onClick={() => moveLessons(moveDialog.lessonIds, null)}
                disabled={busy || isCurrentMoveTarget(null)}
              >
                <span><strong>Bez složky</strong><small>{lessonCount(null)} lekcí</small></span>
                {isCurrentMoveTarget(null) ? <em>Aktuálně</em> : <span aria-hidden="true">→</span>}
              </button>

              {roots.map((root) => (
                <div className={styles.moveFolderGroup} key={root.id}>
                  <div className={styles.moveFolderRootRow}>
                    <button
                      type="button"
                      className={`${styles.moveFolderButton} ${isCurrentMoveTarget(root.id) ? styles.currentMoveFolder : ''}`}
                      onClick={() => moveLessons(moveDialog.lessonIds, root.id)}
                      disabled={busy || isCurrentMoveTarget(root.id)}
                    >
                      <span><strong>{root.name}</strong><small>{lessonCount(root.id)} lekcí</small></span>
                      {isCurrentMoveTarget(root.id) ? <em>Aktuálně</em> : <span aria-hidden="true">→</span>}
                    </button>
                    <button type="button" className={styles.addChildInDialog} onClick={() => createFolder(root.id)} disabled={busy} aria-label={`Přidat podsložku do ${root.name}`}>+</button>
                  </div>
                  {(childrenByParent.get(root.id) ?? []).map((child) => (
                    <button
                      type="button"
                      className={`${styles.moveFolderButton} ${styles.moveChildFolder} ${isCurrentMoveTarget(child.id) ? styles.currentMoveFolder : ''}`}
                      onClick={() => moveLessons(moveDialog.lessonIds, child.id)}
                      disabled={busy || isCurrentMoveTarget(child.id)}
                      key={child.id}
                    >
                      <span><strong>{child.name}</strong><small>v {root.name} · {lessonCount(child.id)} lekcí</small></span>
                      {isCurrentMoveTarget(child.id) ? <em>Aktuálně</em> : <span aria-hidden="true">→</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className={styles.dialogFooter}>
              <button type="button" className="secondary" onClick={() => createFolder(null)} disabled={busy}>+ Nová složka</button>
              <button type="button" className="secondary" onClick={closeMoveDialog} disabled={busy}>Zrušit</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
