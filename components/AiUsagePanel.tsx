import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import { quotaSourceLabel } from '@/lib/ai-quota';
import {
  aiUsageRemainingText,
  aiUsageRowLabel,
  aiUsageRows,
  formatQuotaResetDate,
} from '@/lib/ai-grading-quota-communication';
import styles from './AiUsagePanel.module.css';

// Server-rendered overview of the AI allowance on My lessons. Values come from
// get_ai_quota(); rows the plan does not include are omitted.
export default function AiUsagePanel({ quota, english }: { quota: AiQuotaSnapshot | null; english: boolean }) {
  const rows = aiUsageRows(quota);
  if (!quota || rows.length === 0) return null;

  const resetDate = formatQuotaResetDate(quota.quota_window_end, english);
  const source = quotaSourceLabel(quota.quota_source, english);
  const resetText = resetDate
    ? `${english ? 'Resets on' : 'Obnoví se'} ${resetDate}${source ? ` · ${source}` : ''}`
    : null;
  const shared = quota.quota_scope === 'organization';

  return (
    <section className={styles.panel} aria-labelledby="ai-usage-heading">
      <div className={styles.head}>
        <h2 id="ai-usage-heading">{english ? 'AI usage' : 'Využití AI'}</h2>
        {shared ? <span className={styles.shared}>{english ? 'Shared school allowance' : 'Sdílený limit školy'}</span> : null}
      </div>
      <ul className={styles.rows}>
        {rows.map((row) => {
          const label = aiUsageRowLabel(row.kind, english);
          const usedPercent = Math.min(100, Math.round((row.used / row.limit) * 100));
          return (
            <li key={row.kind} className={row.exhausted ? `${styles.row} ${styles.exhausted}` : styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.label}>{label}</span>
                <span className={styles.remaining}>{aiUsageRemainingText(row, english)}</span>
              </div>
              <div
                className={styles.track}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={row.limit}
                aria-valuenow={Math.min(row.used, row.limit)}
                aria-valuetext={english ? `${row.used} of ${row.limit} used` : `využito ${row.used} z ${row.limit}`}
              >
                <span className={styles.fill} style={{ width: `${usedPercent}%` }} />
              </div>
              {resetText ? <span className={styles.reset}>{resetText}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
