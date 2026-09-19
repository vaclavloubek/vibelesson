'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import styles from './WorksheetPage.module.css';

export default function WorksheetPrintToolbar({
  lessonId,
  lessonTitle,
  english,
  teacherMode,
  worksheetQuery,
}: {
  lessonId: string;
  lessonTitle: string;
  english: boolean;
  teacherMode: boolean;
  worksheetQuery: string;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = lessonTitle + ' — ' + (english ? 'worksheet' : 'pracovní list') + ' — Syllonaut';
    return () => { document.title = previous; };
  }, [english, lessonTitle]);

  const pdfUrl = '/api/lessons/' + encodeURIComponent(lessonId) + '/worksheet-pdf?' + worksheetQuery;
  const downloadUrl = pdfUrl + (worksheetQuery ? '&' : '') + 'download=1';

  return (
    <div className={styles.toolbar} aria-label={english ? 'Worksheet actions' : 'Akce pracovního listu'}>
      <div>
        <Link href={'/lessons/' + encodeURIComponent(lessonId)} className={styles.backLink}>← {english ? 'Back to lesson' : 'Zpět k lekci'}</Link>
        <span className={styles.toolbarMode}>{teacherMode ? (english ? 'Teacher key' : 'Klíč pro učitele') : (english ? 'Student version' : 'Studentská verze')}</span>
      </div>
      <div className={styles.toolbarActions}>
        <span>{english ? 'PDF is generated directly by Syllonaut, independently of browser printing.' : 'PDF generuje přímo Syllonaut, nezávisle na tisku prohlížeče.'}</span>
        <a className={styles.printPdfLink} href={pdfUrl} target="_blank" rel="noreferrer">{english ? 'Open PDF for print' : 'Otevřít PDF pro tisk'}</a>
        <a className={styles.downloadPdfLink} href={downloadUrl}>{english ? 'Download PDF' : 'Stáhnout PDF'}</a>
      </div>
    </div>
  );
}
