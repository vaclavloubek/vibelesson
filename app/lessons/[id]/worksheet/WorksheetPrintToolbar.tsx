'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import styles from './WorksheetPage.module.css';

export default function WorksheetPrintToolbar({ lessonId, lessonTitle, english, teacherMode }: { lessonId: string; lessonTitle: string; english: boolean; teacherMode: boolean }) {
  useEffect(() => {
    const previous = document.title;
    document.title = lessonTitle + ' — ' + (english ? 'worksheet' : 'pracovní list') + ' — Syllonaut';
    return () => { document.title = previous; };
  }, [english, lessonTitle]);

  return (
    <div className={styles.toolbar} aria-label={english ? 'Worksheet actions' : 'Akce pracovního listu'}>
      <div>
        <Link href={'/lessons/' + encodeURIComponent(lessonId)} className={styles.backLink}>← {english ? 'Back to lesson' : 'Zpět k lekci'}</Link>
        <span className={styles.toolbarMode}>{teacherMode ? (english ? 'Teacher key' : 'Klíč pro učitele') : (english ? 'Student version' : 'Studentská verze')}</span>
      </div>
      <div className={styles.toolbarActions}>
        <span>{english ? 'For PDF, choose “Save as PDF” in the print dialog.' : 'Pro PDF zvolte v tiskovém dialogu „Uložit jako PDF“.'}</span>
        <button type="button" onClick={() => window.print()}>{english ? 'Print / save PDF' : 'Tisk / uložit PDF'}</button>
      </div>
    </div>
  );
}
