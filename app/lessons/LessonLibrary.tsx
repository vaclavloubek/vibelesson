'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  const [bulkFolderId, setBulkFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const orderedFolders = useMemo(
    () => roots.flatMap((root) => [root, ...(childrenByParent.get(root.id) ?? [])]),
    [childrenByParent, roots],
  );

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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lekce se nepodařilo přesunout.');
    } finally {
      setBusy(false);
    }
  }

  function renderFolderNavigation() {
    return (
      <div className={styles.folderNavigation}>
        <div className={styles.folderNavTop}>
          <strong>Složky</strong>
          <button type="button" onClick={() => createFolder(null)} disabled={busy}>+ Složka</button>
        </div>
        <button type="button" className={scope === 'all' ? styles.scopeActive : styles.scopeButton} onClick={() => setScope('all')}>
          <span>Všechny lekce</span><small>{lessons.length}</small>
        </button>
        <button type="button" className={scope === 'unfiled' ? styles.scopeActive : styles.scopeButton} onClick={() => setScope('unfiled')}>
          <span>Bez složky</span><small>{lessonCount(null)}</small>
        </button>
        <div className={styles.folderTree}>
          {roots.map((root) => (
            <div key={root.id}>
              <div className={styles.folderRow}>
                <button type="button" className={scope === root.id ? styles.folderActive : styles.folderButton} onClick={() => setScope(root.id)}>
                  <span>{root.name}</span><small>{lessonCount(root.id)}</small>
                </button>
                <div className={styles.folderActions}>
                  <button type="button" title="Přidat podsložku" onClick={() => createFolder(root.id)} disabled={busy}>+</button>
                  <button type="button" title="Přejmenovat" onClick={() => renameFolder(root)} disabled={busy}>✎</button>
                  <button type="button" title="Smazat" onClick={() => deleteFolder(root)} disabled={busy}>×</button>
                </div>
              </div>
              {(childrenByParent.get(root.id) ?? []).map((child) => (
                <div className={`${styles.folderRow} ${styles.childFolder}`} key={child.id}>
                  <button type="button" className={scope === child.id ? styles.folderActive : styles.folderButton} onClick={() => setScope(child.id)}>
                    <span>{child.name}</span><small>{lessonCount(child.id)}</small>
                  </button>
                  <div className={styles.folderActions}>
                    <button type="button" title="Přejmenovat" onClick={() => renameFolder(child)} disabled={busy}>✎</button>
                    <button type="button" title="Smazat" onClick={() => deleteFolder(child)} disabled={busy}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
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
            <Link href={newLessonHref} className="primary button-link">+ Nová lekce{activeFolder ? ' sem' : ''}</Link>
          </div>
        </div>

        {selectionMode ? (
          <div className={styles.bulkToolbar}>
            <strong>Vybráno: {selectedLessonIds.length}</strong>
            <select value={bulkFolderId} onChange={(event) => setBulkFolderId(event.target.value)} disabled={busy}>
              <option value="">Bez složky</option>
              {orderedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.parentId ? `↳ ${folder.name}` : folder.name}</option>)}
            </select>
            <button type="button" className="secondary" onClick={() => moveLessons(selectedLessonIds, bulkFolderId || null)} disabled={busy || selectedLessonIds.length === 0}>Přesunout</button>
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
              <article className="lesson-card" key={lesson.id}>
                <div className="lesson-card-top">
                  <div className={styles.cardTitleWrap}>
                    {selectionMode ? <input type="checkbox" checked={selectedLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} aria-label={`Vybrat lekci ${lesson.title}`} /> : null}
                    <div><Link href={`/lessons/${lesson.id}`} className="lesson-title-link"><h2>{lesson.title}</h2></Link>{lesson.subtitle ? <p>{lesson.subtitle}</p> : null}</div>
                  </div>
                  <LessonActions lessonId={lesson.id} title={lesson.title} />
                </div>
                <div className="lesson-card-meta"><span>{lesson.audience}</span><span>{lesson.totalMinutes} min</span><span>{lesson.blockCount} aktivit</span></div>
                <div className={`lesson-card-footer ${styles.cardFooter}`}>
                  <span>Upraveno {formatUpdatedAt(lesson.updatedAt)}</span>
                  <div className={styles.cardMoveActions}>
                    <select value={lesson.folderId ?? ''} onChange={(event) => moveLessons([lesson.id], event.target.value || null)} disabled={busy || selectionMode} aria-label={`Přesunout lekci ${lesson.title}`}>
                      <option value="">Bez složky</option>
                      {orderedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.parentId ? `↳ ${folder.name}` : folder.name}</option>)}
                    </select>
                    <Link href={`/lessons/${lesson.id}`} className="auth-link">Otevřít</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
