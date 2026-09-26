import { useId } from 'react';
import type { LessonDataTable as LessonDataTableValue } from '@/lib/schema';
import styles from './LessonDataTable.module.css';

// Short values (years, genres, numbers) sit two per line; the first cell and
// longer text take the full card width.
const SHORT_FIELD_MAX_LENGTH = 24;

function fieldClassName(cellIndex: number, cell: string) {
  if (cellIndex === 0) return `${styles.field} ${styles.lead}`;
  return cell.length > SHORT_FIELD_MAX_LENGTH ? `${styles.field} ${styles.wide}` : styles.field;
}

// Wide blocks show the table; narrow ones (phones) show one card per row, with
// the column names as labels, so the text stays at reading size without
// horizontal scrolling. Only one of the two is displayed (CSS container query),
// so assistive technology meets the data once.
export default function LessonDataTable({ data }: { data: LessonDataTableValue }) {
  const captionId = useId();
  const labelledBy = data.caption ? captionId : undefined;
  return (
    <div className={styles.root}>
      {data.caption ? <p id={captionId} className={styles.caption}>{data.caption}</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-labelledby={labelledBy} style={{ minWidth: Math.max(420, data.columns.length * 130) }}>
          <thead>
            <tr>
              {data.columns.map((column) => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join('\u0000')}`}>
                {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.cards} aria-labelledby={labelledBy}>
        {data.rows.map((row, rowIndex) => (
          <li key={`${rowIndex}-${row.join('\u0000')}`} className={styles.card}>
            <dl>
              {row.map((cell, cellIndex) => cell.trim() ? (
                <div key={`${rowIndex}-${cellIndex}`} className={fieldClassName(cellIndex, cell)}>
                  <dt>{data.columns[cellIndex]}</dt>
                  <dd>{cell}</dd>
                </div>
              ) : null)}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
