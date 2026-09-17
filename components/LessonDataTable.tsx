import type { LessonDataTable as LessonDataTableValue } from '@/lib/schema';

export default function LessonDataTable({ data }: { data: LessonDataTableValue }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 14, marginBottom: 14 }}>
      <table
        style={{
          width: '100%',
          minWidth: Math.max(420, data.columns.length * 130),
          borderCollapse: 'collapse',
          fontSize: 14,
        }}
      >
        {data.caption ? (
          <caption style={{ textAlign: 'left', captionSide: 'top', fontWeight: 700, paddingBottom: 8 }}>
            {data.caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th
                key={column}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '9px 10px',
                  border: '1px solid var(--line)',
                  background: 'var(--soft)',
                  verticalAlign: 'top',
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('\u0000')}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  style={{
                    padding: '9px 10px',
                    border: '1px solid var(--line)',
                    verticalAlign: 'top',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
