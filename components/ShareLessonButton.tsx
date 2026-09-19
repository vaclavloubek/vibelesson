'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';
import styles from './ShareLessonButton.module.css';

type Share = {
  token: string;
  url: string;
  createdAt: string;
};

type ShareResponse = {
  share?: Share | null;
  sharingRestricted?: boolean;
  error?: string;
};

const DIALOG_TITLE_ID = 'share-lesson-dialog-title';
const DIALOG_DESCRIPTION_ID = 'share-lesson-dialog-description';

export default function ShareLessonButton({ lessonId }: { lessonId: string }) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [sharingRestricted, setSharingRestricted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])')?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
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
  }, [busy, open]);

  async function request(method: 'GET' | 'POST' | 'DELETE') {
    const response = await fetch(`/api/lessons/${lessonId}/share`, {
      method,
      cache: 'no-store',
    });
    const data = await response.json() as ShareResponse;
    if (!response.ok) {
      if (data.sharingRestricted || data.error === 'organization_library_public_share_forbidden') {
        setSharingRestricted(true);
        throw new Error(ui(
          'Lekce ze školní knihovny nelze sdílet veřejným odkazem.',
          'Lessons from a school library cannot be shared with a public link.',
        ));
      }
      throw new Error(localizedApiError(data.error, locale, 'Sdílení se nepodařilo.', 'The lesson could not be shared.'));
    }
    return data;
  }

  async function showDialog() {
    setOpen(true);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await request('GET');
      setShare(data.share ?? null);
      setSharingRestricted(Boolean(data.sharingRestricted));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Sdílení se nepodařilo načíst.', 'Sharing could not be loaded.'));
    } finally {
      setBusy(false);
    }
  }

  async function createShare() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await request('POST');
      if (data.sharingRestricted) {
        setSharingRestricted(true);
        return;
      }
      if (!data.share) throw new Error(ui('Odkaz se nepodařilo vytvořit.', 'The link could not be created.'));
      setShare(data.share);
      setMessage(ui('Odkaz je připravený.', 'The link is ready.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Odkaz se nepodařilo vytvořit.', 'The link could not be created.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!share) return;
    setError('');
    try {
      await navigator.clipboard.writeText(share.url);
      setMessage(ui('Odkaz je zkopírovaný.', 'Link copied.'));
    } catch {
      setMessage(ui('Označ odkaz v poli a zkopíruj ho ručně.', 'Select the link in the field and copy it manually.'));
    }
  }

  async function revokeShare() {
    if (!share || !window.confirm(ui(
      'Vypnout tento odkaz? Uložené kopie kolegů zůstanou zachované.',
      'Turn off this link? Copies already saved by colleagues will remain available.',
    ))) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request('DELETE');
      setShare(null);
      setMessage(ui('Odkaz byl vypnutý.', 'The link was turned off.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Sdílení se nepodařilo vypnout.', 'The link could not be turned off.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="secondary" onClick={() => void showDialog()}>
        {ui('Sdílet s kolegy', 'Share with colleagues')}
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div className={styles.backdrop} onMouseDown={close}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={DIALOG_TITLE_ID}
            aria-describedby={DIALOG_DESCRIPTION_ID}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.header}>
              <div>
                <span className="eyebrow">{ui('Sdílená lekce', 'Shared lesson')}</span>
                <h2 id={DIALOG_TITLE_ID}>{ui('Sdílet s kolegy', 'Share with colleagues')}</h2>
              </div>
              <button type="button" className={styles.close} onClick={close} disabled={busy} aria-label={ui('Zavřít sdílení', 'Close sharing')}>×</button>
            </div>

            <div className={styles.body}>
              {sharingRestricted ? (
                <>
                  <p id={DIALOG_DESCRIPTION_ID}>
                    {ui(
                      'Tato lekce pochází ze školní knihovny. Můžeš ji používat a upravovat pro svou výuku, ale nelze pro ni vytvořit veřejný odkaz.',
                      'This lesson comes from a school library. You can use and edit it for your teaching, but you cannot create a public link for it.',
                    )}
                  </p>
                  <div className={styles.protection}>
                    <strong>{ui('Obsah zůstává uvnitř školy.', 'School content stays within the school.')}</strong>
                    <span>{ui(
                      'Omezení se přenáší i na kopie a další odvozené verze této lekce.',
                      'The restriction also follows copies and other derived versions of this lesson.',
                    )}</span>
                  </div>
                </>
              ) : (
                <>
                  <p id={DIALOG_DESCRIPTION_ID}>
                    {ui(
                      'Kdokoli s odkazem uvidí náhled této verze lekce včetně poznámek pro učitele. Neuvidí výsledky studentů, kódy hodin ani historii AI úprav.',
                      'Anyone with the link can preview this lesson version, including teacher notes. Student results, lesson codes and AI edit history stay private.',
                    )}
                  </p>
                  <div className={styles.protection}>
                    <strong>{ui('Každý učí ze svého účtu.', 'Everyone teaches from their own account.')}</strong>
                    <span>{ui(
                      'Kolega se pro uložení a spuštění přihlásí a dostane samostatnou kopii.',
                      'A colleague signs in to save and run an independent copy.',
                    )}</span>
                  </div>

                  {share ? (
                    <div className={styles.linkBlock}>
                      <label htmlFor="lesson-share-url">{ui('Odkaz pro kolegy', 'Link for colleagues')}</label>
                      <div className={styles.linkRow}>
                        <input id="lesson-share-url" value={share.url} readOnly onFocus={(event) => event.currentTarget.select()} />
                        <button type="button" className="primary" onClick={() => void copyShare()} disabled={busy}>{ui('Kopírovat', 'Copy')}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="primary" onClick={() => void createShare()} disabled={busy}>
                      {busy ? ui('Připravuji odkaz…', 'Creating link…') : ui('Vytvořit odkaz', 'Create link')}
                    </button>
                  )}
                </>
              )}

              {error ? <div className="error" role="alert">{error}</div> : null}
              {message ? <p className={styles.message} role="status">{message}</p> : null}
            </div>

            <div className={styles.footer}>
              {share && !sharingRestricted ? <button type="button" className={styles.revoke} onClick={() => void revokeShare()} disabled={busy}>{ui('Vypnout odkaz', 'Turn off link')}</button> : <span />}
              <button type="button" className="secondary" onClick={close} disabled={busy}>{ui('Hotovo', 'Done')}</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
