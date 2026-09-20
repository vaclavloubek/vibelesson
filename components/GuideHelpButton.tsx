'use client';

import { useUiLocale } from '@/components/LocaleProvider';
import { startSyllonautGuide, type SyllonautGuideChapter } from '@/lib/onboarding-guide';

type Props = {
  userId: string | null;
  chapter: SyllonautGuideChapter;
  step: number;
  labelCs: string;
  labelEn: string;
  className?: string;
};

export default function GuideHelpButton({ userId, chapter, step, labelCs, labelEn, className }: Props) {
  const english = useUiLocale() === 'en';
  if (!userId) return null;

  const label = english ? labelEn : labelCs;

  return (
    <button
      type="button"
      className={['syllonaut-guide-help', className].filter(Boolean).join(' ')}
      onClick={() => startSyllonautGuide(userId, chapter, step)}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
