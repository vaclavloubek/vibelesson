import Link from 'next/link';
import CopyableJoinLink from '@/components/CopyableJoinLink';
import { REFERRAL_PROGRAM } from '@/lib/referral-program-config';
import type { ReferralSection } from '@/lib/referral-program';
import type { UiLocale } from '@/lib/i18n';
import styles from '@/app/subscription/page.module.css';

function formatDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

function bonusLessonsCs(count: number) {
  if (count === 1) return '1 bonusovou lekci';
  if (count >= 2 && count <= 4) return `${count} bonusové lekce`;
  return `${count} bonusových lekcí`;
}

// Numbers only: never names or emails of invited colleagues.
export default function ReferralProgramSection({
  section,
  locale,
  className,
}: {
  section: ReferralSection;
  locale: UiLocale;
  className: string;
}) {
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const url = `https://syllonaut.com/${locale}?ref=${section.code}`;
  const p = REFERRAL_PROGRAM;

  return (
    <section id="doporuceni" className={className} aria-labelledby="referral-heading">
      <h2 id="referral-heading">{ui('Doporuč Syllonaut kolegům', 'Recommend Syllonaut to colleagues')}</h2>
      <p className={styles.referralLead}>
        {ui(
          `Za každého kolegu, který se zaregistruje přes tvůj odkaz a do ${p.qualifyWindowDays} dnů odučí živou hodinu, ve které aspoň ${p.minSubmittingParticipants} studentů odešle odpověď, nebo si předplatí placený tarif, získáš ${p.rewardUnits} bonusové lekce s platností ${p.rewardValidMonths} měsíců.`,
          `For every colleague who signs up through your link and, within ${p.qualifyWindowDays} days, either teaches a live lesson in which at least ${p.minSubmittingParticipants} students submit an answer or subscribes to a paid plan, you get ${p.rewardUnits} bonus lessons valid for ${p.rewardValidMonths} months.`,
        )}
        {' '}
        {ui(
          `Bonusové lekce se čerpají až po vyčerpání měsíčního limitu tarifu; odměny jsou nejvýš ${p.monthlyCap} za měsíc a ${p.totalCap} celkem.`,
          `Bonus lessons are used only after your plan's monthly limit runs out; rewards are capped at ${p.monthlyCap} per month and ${p.totalCap} in total.`,
        )}
      </p>

      <div className={styles.referralLink}>
        <span className={styles.referralLabel}>{ui('Tvůj odkaz', 'Your link')}</span>
        <CopyableJoinLink url={url} fallback={url} />
      </div>

      <div className={styles.referralBonus}>
        <span className={styles.referralLabel}>{ui('Bonusové lekce', 'Bonus lessons')}</span>
        <strong className={styles.referralBonusCount}>{section.bonusRemaining}</strong>
        <p>
          {english
            ? `You have ${section.bonusRemaining} bonus ${section.bonusRemaining === 1 ? 'lesson' : 'lessons'} for recommending Syllonaut.`
            : `Za doporučení Syllonautu máš ${bonusLessonsCs(section.bonusRemaining)}.`}
          {section.bonusNextExpiry && section.bonusRemaining > 0
            ? ` ${ui('Nejbližší vyprší', 'The next ones expire on')} ${formatDate(section.bonusNextExpiry, english)}.`
            : ''}
        </p>
      </div>

      <dl className={styles.referralStats}>
        <div>
          <dt>{ui('Čeká na splnění podmínek', 'Waiting for the conditions')}</dt>
          <dd>{section.pendingCount}</dd>
        </div>
        <div>
          <dt>{ui('Odměněno', 'Rewarded')}</dt>
          <dd>{section.rewardedCount}</dd>
        </div>
      </dl>

      <p className={styles.referralRules}>
        <Link href={`/${locale}/referral`}>{ui('Pravidla doporučování', 'Referral rules')}</Link>
      </p>
    </section>
  );
}
