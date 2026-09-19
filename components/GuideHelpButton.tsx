'use client';

import { useUiLocale } from '@/components/LocaleProvider';
import { startSyllonautGuide, type SyllonautGuideChapter } from '@/lib/onboarding-guide';

type Props = {
  userId: string | null;
  chapter: SyllonautGuideChapter;
  step: number;
  labelCs: string;
  labelEn: string;
};

export default function GuideHelpButton({ userId, chapter, step, labelCs, labelEn }: Props) {
  const english = useUiLocale() === 'en';
  if (!userId) return null;

  const label = english ? labelEn : labelCs;

  return (
    <button
      type="button"
      className="syllonaut-guide-help"
      onClick={() => startSyllonautGuide(userId, chapter, step)}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
