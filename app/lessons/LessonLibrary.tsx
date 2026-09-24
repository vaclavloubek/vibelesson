'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import LessonActions from './LessonActions';
import StartSessionButton, { FREE_SINGLE_USE_NOTICE } from '@/components/StartSessionButton';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import { bucketItemCount, trackEvent } from '@/lib/analytics';
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
  archived: boolean;
  licenseLocked: boolean;
  organizationName: string | null;
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
  reusableLessons: boolean;
  userId: string;
};

type Scope = 'all' | 'unfiled' | string;
type DropTarget = 'unfiled' | string | null;
type MoveDialogState = {
  lessonIds: string[];
  label: string;
  currentFolderId?: string | null;
};

const MOVE_DIALOG_TITLE_ID = 'move-dialog-title';

function formatUpdatedAt(value: string, locale: 'cs' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export default function LessonLibrary({ lessons, folders, canManageFolders, reusableLessons, userId }: Props) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
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
    () => folders.filter((folder) => !folder.parentId).sort((a, b) => a.name.localeCompare(b.name, locale)),
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
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, locale));
    return map;
  }, [folders, locale]);

  const accessibleLessons = useMemo(() => lessons.filter((lesson) => !lesson.licenseLocked), [lessons]);
  const lockedLessons = useMemo(() => lessons.filter((lesson) => lesson.licenseLocked), [lessons]);
  const freeSingleUseNotice = !reusableLessons && accessibleLessons.some((lesson) => !lesson.archived) ? (
    <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
      <p style={{ margin: 0 }}>{english ? FREE_SINGLE_USE_NOTICE.en : FREE_SINGLE_USE_NOTICE.cs}</p>
    </div>
  ) : null;
  const visibleLessons = useMemo(() => {
    if (!canManageFolders || scope === 'all') return accessibleLessons;
    if (scope === 'unfiled') return accessibleLessons.filter((lesson) => !lesson.folderId);
    return accessibleLessons.filter((lesson) => lesson.folderId === scope);
  }, [accessibleLessons, canManageFolders, scope]);

  const activeFolder = folders.find((folder) => folder.id === scope) ?? null;
  const newLessonHref = activeFolder ? `/new?folder=${encodeURIComponent(activeFolder.id)}` : '/new';

  function lessonCount(folderId: string | null) {
    return accessibleLessons.filter((lesson) => lesson.folderId === folderId).length;
  }

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function requestJson(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json() as { error?: string };
    if (!res.ok) throw new Error(localizedApiError(data.error, locale, 'Operace se nepodařila.', 'The operation failed.'));
    return data;
  }

  async function createFolder(parentId: string | null) {
    const parent = parentId ? folders.find((folder) => folder.id === parentId) : null;
    const name = window.prompt(parent
      ? (english ? `Subfolder name in “${parent.name}”:` : `Název podsložky ve „${parent.name}“:`)
      : ui('Název nové složky:', 'New folder name:'))?.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      trackEvent('folder_created');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Složku se nepodařilo vytvořit.', 'The folder could not be created.'));
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(folder: LessonFolderItem) {
    const name = window.prompt(ui('Nový název složky:', 'New folder name:'), folder.name)?.trim();
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
      setError(err instanceof Error ? err.message : ui('Složku se nepodařilo přejmenovat.', 'The folder could not be renamed.'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(folder: LessonFolderItem) {
    if ((childrenByParent.get(folder.id) ?? []).length) {
      setError(ui('Nejdřív smaž podsložky. Smazání nadřazené složky se záměrně neprovádí automaticky.', 'Delete the subfolders first. Parent folders are intentionally not deleted automatically.'));
      return;
    }
    if (!window.confirm(english
      ? `Delete folder “${folder.name}”? Lessons will not be deleted; they will move to “Unfiled”.`
      : `Smazat složku „${folder.name}“? Lekce se nesmažou, přesunou se do „Bez složky“.`)) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (scope === folder.id) setScope('unfiled');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Složku se nepodařilo smazat.', 'The folder could not be deleted.'));
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
      if (lessonIds.length > 1) {
        trackEvent('bulk_lessons_moved', { item_count_bucket: bucketItemCount(lessonIds.length) });
      } else if (folderId) {
        trackEvent('lesson_moved_to_folder');
      }
      setSelectedLessonIds([]);
      if (moveDialog) closeMoveDialog();
      if (selectionMode) setSelectionMode(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Lekce se nepodařilo přesunout.', 'The lesson could not be moved.'));
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
      label: english
        ? `${selectedLessonIds.length} ${selectedLessonIds.length === 1 ? 'lesson' : 'lessons'}`
        : `${selectedLessonIds.length} ${selectedLessonIds.length === 1 ? 'lekce' : selectedLessonIds.length < 5 ? 'lekce' : 'lekcí'}`,
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
      <nav className={styles.folderNavigation} aria-label={ui('Složky lekcí', 'Lesson folders')}>
        <div className={styles.folderNavTop}>
          <strong>{ui('Složky', 'Folders')}</strong>
          <button type="button" onClick={() => createFolder(null)} disabled={busy}>+ {ui('Složka', 'Folder')}</button>
        </div>
        <button type="button" aria-pressed={scope === 'all'} className={scope === 'all' ? styles.scopeActive : styles.scopeButton} onClick={() => setScope('all')}>
          <span>{ui('Všechny lekce', 'All lessons')}</span><small>{accessibleLessons.length}</small>
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
          <span>{ui('Bez složky', 'Unfiled')}</span><small>{lessonCount(null)}</small>
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
                  <button type="button" title={ui('Přidat podsložku', 'Add subfolder')} aria-label={english ? `Add subfolder to ${root.name}` : `Přidat podsložku do ${root.name}`} onClick={() => createFolder(root.id)} disabled={busy}>+</button>
                  <button type="button" title={ui('Přejmenovat', 'Rename')} aria-label={english ? `Rename folder ${root.name}` : `Přejmenovat složku ${root.name}`} onClick={() => renameFolder(root)} disabled={busy}>✎</button>
                  <button type="button" title={ui('Smazat', 'Delete')} aria-label={english ? `Delete folder ${root.name}` : `Smazat složku ${root.name}`} onClick={() => deleteFolder(root)} disabled={busy}>×</button>
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
                    <button type="button" title={ui('Přejmenovat', 'Rename')} aria-label={english ? `Rename folder ${child.name}` : `Přejmenovat složku ${child.name}`} onClick={() => renameFolder(child)} disabled={busy}>✎</button>
                    <button type="button" title={ui('Smazat', 'Delete')} aria-label={english ? `Delete folder ${child.name}` : `Smazat složku ${child.name}`} onClick={() => deleteFolder(child)} disabled={busy}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {lessons.length > 0 ? <p className={styles.dragHint}>{ui('Na počítači můžeš lekci přetáhnout přímo do složky. Stejný přesun je vždy dostupný i přes nabídku lekce „Přesunout do…“.', 'On desktop, you can drag a lesson directly into a folder. The same move is always available from the lesson menu via “Move to…”.')}</p> : null}
      </nav>
    );
  }

  const renderLockedLessons = (items: LessonListItem[]) => (
    <>
      <section className="lessons-heading" style={{ marginTop: 36 }}>
        <div>
          <span className="eyebrow">{ui('Licenční zámek', 'Licence lock')}</span>
          <h2 style={{ fontSize: 30, margin: '5px 0 8px', letterSpacing: '-.035em' }}>{ui('Školní lekce bez aktivního přístupu', 'School lessons without active access')}</h2>
          <p>{ui(
            'Tyto lekce zůstávají uložené a můžeš je otevřít nebo smazat. Úpravy, kopírování, exporty a živé použití se znovu odemknou po obnovení přístupu k původní organizaci.',
            'These lessons remain stored and can be opened or deleted. Editing, copying, exports and live use unlock again when access to the originating organisation is restored.',
          )}</p>
        </div>
      </section>
      <section className="lesson-grid">
        {items.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div className="lesson-card-top">
              <div>
                <Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>
                {lesson.subtitle ? <p>{lesson.subtitle}</p> : null}
                <span className="beta">{ui('ZAMČENO', 'LOCKED')}</span>
              </div>
              <LessonActions lessonId={lesson.id} title={lesson.title} licenseLocked />
            </div>
            <div className="lesson-card-meta">
              <span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} {english ? 'activities' : 'aktivit'}</span>
            </div>
            <div className="lesson-card-footer">
              <span>{lesson.organizationName
                ? ui(`Původ: ${lesson.organizationName}`, `Origin: ${lesson.organizationName}`)
                : ui('Původ: školní knihovna', 'Origin: school library')}</span>
              <Link href={`/lessons/${lesson.id}`} className="auth-link">{ui('Otevřít', 'Open')}</Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  if (!canManageFolders) {
    const activeLessons = accessibleLessons.filter((lesson) => !lesson.archived);
    const archivedLessons = accessibleLessons.filter((lesson) => lesson.archived);
    const renderCards = (items: LessonListItem[]) => (
      <section className="lesson-grid">
        {items.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div className="lesson-card-top">
              <div>
                <Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>
                {lesson.subtitle ? <p>{lesson.subtitle}</p> : null}
                {lesson.archived ? <span className="beta">{ui('ARCHIV', 'ARCHIVED')}</span> : null}
              </div>
              <LessonActions lessonId={lesson.id} title={lesson.title} />
            </div>
            <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} {english ? 'activities' : 'aktivit'}</span></div>
            <div className="lesson-card-footer">
              <span>{lesson.archived ? ui('První živé použití dokončeno', 'First live use completed') : `${ui('Upraveno', 'Updated')} ${formatUpdatedAt(lesson.updatedAt, locale)}`}</span>
              {lesson.archived ? <Link href={`/lessons/${lesson.id}`} className="auth-link">{ui('Otevřít', 'Open')}</Link> : (
                <div className="lesson-card-launch">
                  <Link href={`/lessons/${lesson.id}`} className="auth-link">{ui('Otevřít', 'Open')}</Link>
                  <StartSessionButton lessonId={lesson.id} userId={userId} compact />
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    );

    return (
      <>
        {freeSingleUseNotice}
        {activeLessons.length ? renderCards(activeLessons) : null}
        {archivedLessons.length ? (
          <>
            <section className="lessons-heading" style={{ marginTop: activeLessons.length ? 36 : 0 }}>
              <div>
                <span className="eyebrow">{ui('Archiv', 'Archive')}</span>
                <h2 style={{ fontSize: 30, margin: '5px 0 8px', letterSpacing: '-.035em' }}>{ui('Archivované lekce', 'Archived lessons')}</h2>
                <p>{ui(
                  'Tyto lekce už mají za sebou první živé použití ve Free tarifu. Stále je můžeš otevírat a upravovat pomocí AI v rámci svého limitu; placený tarif odemkne jejich další živé použití.',
                  'These lessons have completed their first live use on the Free plan. You can still open and edit them with AI within your allowance; a paid plan unlocks further live use.',
                )}</p>
              </div>
            </section>
            {renderCards(archivedLessons)}
          </>
        ) : null}
        {lockedLessons.length ? renderLockedLessons(lockedLessons) : null}
      </>
    );
  }

  return (
    <section className={styles.libraryLayout} aria-busy={busy}>
      <aside className={styles.sidebar}>{renderFolderNavigation()}</aside>
      <div className={styles.libraryMain}>
        <details className={styles.mobileFolders}>
          <summary>{ui('Složky', 'Folders')}</summary>
          {renderFolderNavigation()}
        </details>

        <div className={styles.libraryToolbar}>
          <div>
            <span className="eyebrow">{activeFolder ? ui('Vybraná složka', 'Selected folder') : scope === 'unfiled' ? ui('Bez složky', 'Unfiled') : ui('Knihovna', 'Library')}</span>
            <h2>{activeFolder?.name ?? (scope === 'unfiled' ? ui('Bez složky', 'Unfiled') : ui('Všechny lekce', 'All lessons'))}</h2>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className="secondary" aria-pressed={selectionMode} onClick={() => { setSelectionMode((value) => !value); setSelectedLessonIds([]); }} disabled={busy}>
              {selectionMode ? ui('Hotovo', 'Done') : ui('Vybrat', 'Select')}
            </button>
            <Link href={newLessonHref} className="primary button-link">{activeFolder ? ui('+ Nová lekce v této složce', '+ New lesson in this folder') : ui('+ Nová lekce', '+ New lesson')}</Link>
          </div>
        </div>

        {selectionMode ? (
          <div className={styles.bulkToolbar} role="group" aria-label={ui('Hromadný přesun lekcí', 'Bulk lesson move')}>
            <strong>{ui('Vybráno', 'Selected')}: {selectedLessonIds.length}</strong>
            <button type="button" className="secondary" onClick={openBulkMove} disabled={busy || selectedLessonIds.length === 0}>{ui('Přesunout do…', 'Move to…')}</button>
          </div>
        ) : null}

        {error ? <div className="error" role="alert">{error}</div> : null}

        {freeSingleUseNotice}

        {visibleLessons.length === 0 ? (
          <div className={`panel ${styles.emptyFolder}`}>
            <h3>{lessons.length === 0 ? ui('Zatím tu není žádná lekce', 'No lessons yet') : ui('Tahle složka je zatím prázdná', 'This folder is empty')}</h3>
            <p>{lessons.length === 0 ? ui('Vytvoř první lekci nebo si nejdřív připrav strukturu složek.', 'Create your first lesson or prepare your folder structure first.') : ui('Přesuň sem existující lekce nebo vytvoř novou rovnou v této složce.', 'Move existing lessons here or create a new one directly in this folder.')}</p>
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
                    {selectionMode ? <input type="checkbox" checked={selectedLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} aria-label={english ? `Select lesson ${lesson.title}` : `Vybrat lekci ${lesson.title}`} /> : null}
                    <div><Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div>
                  </div>
                  <LessonActions lessonId={lesson.id} title={lesson.title} onMove={() => openSingleMove(lesson)} moveDisabled={selectionMode || busy} />
                </div>
                <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} {english ? 'activities' : 'aktivit'}</span></div>
                <div className={`lesson-card-footer ${styles.cardFooter}`}>
                  <span>{ui('Upraveno', 'Updated')} {formatUpdatedAt(lesson.updatedAt, locale)}</span>
                  {selectionMode || lesson.archived ? <Link href={`/lessons/${lesson.id}`} className="auth-link">{ui('Otevřít', 'Open')}</Link> : (
                    <div className="lesson-card-launch">
                      <Link href={`/lessons/${lesson.id}`} className="auth-link">{ui('Otevřít', 'Open')}</Link>
                      <StartSessionButton lessonId={lesson.id} userId={userId} compact />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {lockedLessons.length ? <div style={{ gridColumn: '1 / -1' }}>{renderLockedLessons(lockedLessons)}</div> : null}

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
                <span className="eyebrow">{ui('Organizace knihovny', 'Library organization')}</span>
                <h3 id={MOVE_DIALOG_TITLE_ID}>{ui('Přesunout do…', 'Move to…')}</h3>
                <p>{moveDialog.label}</p>
              </div>
              <button type="button" className={styles.dialogClose} aria-label={ui('Zavřít dialog přesunu', 'Close move dialog')} onClick={closeMoveDialog} disabled={busy}>×</button>
            </div>

            <div className={styles.moveFolderList}>
              <button
                type="button"
                className={`${styles.moveFolderButton} ${isCurrentMoveTarget(null) ? styles.currentMoveFolder : ''}`}
                onClick={() => moveLessons(moveDialog.lessonIds, null)}
                disabled={busy || isCurrentMoveTarget(null)}
              >
                <span><strong>{ui('Bez složky', 'Unfiled')}</strong><small>{lessonCount(null)} {english ? 'lessons' : 'lekcí'}</small></span>
                {isCurrentMoveTarget(null) ? <em>{ui('Aktuálně', 'Current')}</em> : <span aria-hidden="true">→</span>}
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
                      <span><strong>{root.name}</strong><small>{lessonCount(root.id)} {english ? 'lessons' : 'lekcí'}</small></span>
                      {isCurrentMoveTarget(root.id) ? <em>{ui('Aktuálně', 'Current')}</em> : <span aria-hidden="true">→</span>}
                    </button>
                    <button type="button" className={styles.addChildInDialog} onClick={() => createFolder(root.id)} disabled={busy} aria-label={english ? `Add subfolder to ${root.name}` : `Přidat podsložku do ${root.name}`}>+</button>
                  </div>
                  {(childrenByParent.get(root.id) ?? []).map((child) => (
                    <button
                      type="button"
                      className={`${styles.moveFolderButton} ${styles.moveChildFolder} ${isCurrentMoveTarget(child.id) ? styles.currentMoveFolder : ''}`}
                      onClick={() => moveLessons(moveDialog.lessonIds, child.id)}
                      disabled={busy || isCurrentMoveTarget(child.id)}
                      key={child.id}
                    >
                      <span><strong>{child.name}</strong><small>{english ? 'in' : 'v'} {root.name} · {lessonCount(child.id)} {english ? 'lessons' : 'lekcí'}</small></span>
                      {isCurrentMoveTarget(child.id) ? <em>{ui('Aktuálně', 'Current')}</em> : <span aria-hidden="true">→</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className={styles.dialogFooter}>
              <button type="button" className="secondary" onClick={() => createFolder(null)} disabled={busy}>+ {ui('Nová složka', 'New folder')}</button>
              <button type="button" className="secondary" onClick={closeMoveDialog} disabled={busy}>{ui('Zrušit', 'Cancel')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
