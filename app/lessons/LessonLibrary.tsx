'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

type MoveDialogState = {
  lessonIds: string[];
  currentFolderId: string | null;
  title: string;
} | null;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moveDialog, setMoveDialog] = useState<MoveDialogState>(null);
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!moveDialog) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) setMoveDialog(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, moveDialog]);

  function lessonCount(folderId: string | null) {
    return lessons.filter((lesson) => lesson.folderId === folderId).length;
  }

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function requestJson<T = { error?: string }>(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json() as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Operace se nepodařila.');
    return data;
  }

  async function createFolder(parentId: string | null) {
    const parent = parentId ? folders.find((folder) => folder.id === parentId) : null;
    const name = window.prompt(parent ? `Název podsložky ve „${parent.name}“:` : 'Název nové složky:')?.trim();
    if (!name) return null;
    setBusy(true);
    setError('');
    try {
      const data = await requestJson<{ folder: LessonFolderItem }>('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      router.refresh();
      return data.folder;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Složku se nepodařilo vytvořit.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createFolderAndMove() {
    if (!moveDialog) return;
    const folder = await createFolder(null);
    if (!folder) return;
    await moveLessons(moveDialog.lessonIds, folder.id);
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
      setMoveDialog(null);
      setDraggingLessonId(null);
      setDropTargetId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lekce se nepodařilo přesunout.');
    } finally {
      setBusy(false);
    }
  }

  function openMoveDialog(lessonIds: string[], currentFolderId: string | null, title: string) {
    setError('');
    setMoveDialog({ lessonIds, currentFolderId, title });
  }

  function startDrag(event: React.DragEvent<HTMLElement>, lesson: LessonListItem) {
    if (selectionMode || busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', lesson.id);
    setDraggingLessonId(lesson.id);
  }

  function allowDrop(event: React.DragEvent<HTMLElement>, targetId: string) {
    if (!draggingLessonId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetId);
  }

  function leaveDropTarget(event: React.DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropTargetId(null);
  }

  function dropLesson(event: React.DragEvent<HTMLElement>, folderId: string | null) {
    event.preventDefault();
    const lessonId = draggingLessonId || event.dataTransfer.getData('text/plain');
    setDropTargetId(null);
    if (!lessonId) return;
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson || lesson.folderId === folderId) {
      setDraggingLessonId(null);
      return;
    }
    void moveLessons([lessonId], folderId);
  }

  function folderButtonClass(folderId: string) {
    const base = scope === folderId ? styles.folderActive : styles.folderButton;
    return dropTargetId === folderId ? `${base} ${styles.dropTarget}` : base;
  }

  function renderFolderNavigation() {
    return (
      <div className={styles.folderNavigation}>
        <div className={styles.folderNavTop}>
          <strong>Složky</strong>
          <button type="button" onClick={() => void createFolder(null)} disabled={busy}>+ Složka</button>
        </div>
        <button type="button" className={scope === 'all' ? styles.scopeActive : styles.scopeButton} onClick={() => setScope('all')}>
          <span>Všechny lekce</span><small>{lessons.length}</small>
        </button>
        <button
          type="button"
          className={`${scope === 'unfiled' ? styles.scopeActive : styles.scopeButton} ${dropTargetId === 'unfiled' ? styles.dropTarget : ''}`}
          onClick={() => setScope('unfiled')}
          onDragOver={(event) => allowDrop(event, 'unfiled')}
          onDragLeave={leaveDropTarget}
          onDrop={(event) => dropLesson(event, null)}
        >
          <span>Bez složky</span><small>{lessonCount(null)}</small>
        </button>
        <div className={styles.folderTree}>
          {roots.map((root) => (
            <div key={root.id}>
              <div className={styles.folderRow}>
                <button
                  type="button"
                  className={folderButtonClass(root.id)}
                  onClick={() => setScope(root.id)}
                  onDragOver={(event) => allowDrop(event, root.id)}
                  onDragLeave={leaveDropTarget}
                  onDrop={(event) => dropLesson(event, root.id)}
                >
                  <span>{root.name}</span><small>{lessonCount(root.id)}</small>
                </button>
                <div className={styles.folderActions}>
                  <button type="button" aria-label={`Přidat podsložku do ${root.name}`} title="Přidat podsložku" onClick={() => void createFolder(root.id)} disabled={busy}>+</button>
                  <button type="button" aria-label={`Přejmenovat složku ${root.name}`} title="Přejmenovat" onClick={() => void renameFolder(root)} disabled={busy}>✎</button>
                  <button type="button" aria-label={`Smazat složku ${root.name}`} title="Smazat" onClick={() => void deleteFolder(root)} disabled={busy}>×</button>
                </div>
              </div>
              {(childrenByParent.get(root.id) ?? []).map((child) => (
                <div className={`${styles.folderRow} ${styles.childFolder}`} key={child.id}>
                  <button
                    type="button"
                    className={folderButtonClass(child.id)}
                    onClick={() => setScope(child.id)}
                    onDragOver={(event) => allowDrop(event, child.id)}
                    onDragLeave={leaveDropTarget}
                    onDrop={(event) => dropLesson(event, child.id)}
                  >
                    <span>{child.name}</span><small>{lessonCount(child.id)}</small>
                  </button>
                  <div className={styles.folderActions}>
                    <button type="button" aria-label={`Přejmenovat složku ${child.name}`} title="Přejmenovat" onClick={() => void renameFolder(child)} disabled={busy}>✎</button>
                    <button type="button" aria-label={`Smazat složku ${child.name}`} title="Smazat" onClick={() => void deleteFolder(child)} disabled={busy}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {draggingLessonId ? <p className={styles.dragHint}>Pusť lekci na složku, kam ji chceš přesunout.</p> : null}
      </div>
    );
  }

  function renderMoveTarget(folder: LessonFolderItem, nested = false) {
    const active = moveDialog?.currentFolderId === folder.id;
    return (
      <button
        key={folder.id}
        type="button"
        className={`${styles.moveTarget} ${nested ? styles.moveTargetChild : ''} ${active ? styles.moveTargetCurrent : ''}`}
        onClick={() => moveDialog && void moveLessons(moveDialog.lessonIds, folder.id)}
        disabled={busy || active}
      >
        <span>{nested ? '↳ ' : ''}{folder.name}</span>
        {active ? <small>Aktuální</small> : null}
      </button>
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
    <>
      <section className={styles.libraryLayout}>
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
              <button type="button" className="secondary" onClick={() => { setSelectionMode((value) => !value); setSelectedLessonIds([]); }} disabled={busy}>
                {selectionMode ? 'Hotovo' : 'Vybrat'}
              </button>
              <Link href={newLessonHref} className="primary button-link">
                {activeFolder ? `+ Nová lekce v „${activeFolder.name}“` : '+ Nová lekce'}
              </Link>
            </div>
          </div>

          {selectionMode ? (
            <div className={styles.bulkToolbar}>
              <strong>Vybráno: {selectedLessonIds.length}</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => openMoveDialog(selectedLessonIds, null, `${selectedLessonIds.length} vybraných lekcí`)}
                disabled={busy || selectedLessonIds.length === 0}
              >
                Přesunout do…
              </button>
            </div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}

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
                  onDragStart={(event) => startDrag(event, lesson)}
                  onDragEnd={() => { setDraggingLessonId(null); setDropTargetId(null); }}
                >
                  <div className="lesson-card-top">
                    <div className={styles.cardTitleWrap}>
                      {selectionMode ? <input type="checkbox" checked={selectedLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} aria-label={`Vybrat lekci ${lesson.title}`} /> : null}
                      <div><Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div>
                    </div>
                    <LessonActions
                      lessonId={lesson.id}
                      title={lesson.title}
                      onMove={() => openMoveDialog([lesson.id], lesson.folderId, lesson.title)}
                    />
                  </div>
                  <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} aktivit</span></div>
                  <div className={`lesson-card-footer ${styles.cardFooter}`}>
                    <span>Upraveno {formatUpdatedAt(lesson.updatedAt)}</span>
                    <span className={styles.dragLabel}>Přetáhni do složky</span>
                    <Link href={`/lessons/${lesson.id}`} className="auth-link">Otevřít</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {moveDialog ? (
        <div className={styles.dialogBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setMoveDialog(null);
        }}>
          <section className={styles.moveDialog} role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
            <div className={styles.moveDialogHeader}>
              <div>
                <span className="eyebrow">Přesunout</span>
                <h2 id="move-dialog-title">{moveDialog.title}</h2>
              </div>
              <button type="button" className={styles.dialogClose} aria-label="Zavřít dialog" onClick={() => setMoveDialog(null)} disabled={busy}>×</button>
            </div>

            <p className={styles.dialogHelp}>Vyber cílovou složku. Přesun proběhne hned po kliknutí.</p>

            <div className={styles.moveTree}>
              <button
                type="button"
                className={`${styles.moveTarget} ${moveDialog.currentFolderId === null ? styles.moveTargetCurrent : ''}`}
                onClick={() => void moveLessons(moveDialog.lessonIds, null)}
                disabled={busy || moveDialog.currentFolderId === null}
              >
                <span>Bez složky</span>
                {moveDialog.currentFolderId === null ? <small>Aktuální</small> : null}
              </button>
              {roots.map((root) => (
                <div key={root.id}>
                  {renderMoveTarget(root)}
                  {(childrenByParent.get(root.id) ?? []).map((child) => renderMoveTarget(child, true))}
                </div>
              ))}
            </div>

            <div className={styles.moveDialogFooter}>
              <button type="button" className="secondary" onClick={() => void createFolderAndMove()} disabled={busy}>+ Nová složka a přesunout</button>
              <button type="button" className="secondary" onClick={() => setMoveDialog(null)} disabled={busy}>Zrušit</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
