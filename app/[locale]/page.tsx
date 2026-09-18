import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LandingBackToTop from '@/components/LandingBackToTop';
import LandingPage from '@/components/LandingPage';
import { normalizeUiLocale, type UiLocale } from '@/lib/i18n';

type Props = {
  params: Promise<{ locale: string }>;
};

const metadataByLocale: Record<UiLocale, { title: string; description: string; ogLocale: string }> = {
  cs: {
    title: 'Syllonaut — AI navigátor pro interaktivní výuku',
    description: 'Z nápadu do živé interaktivní hodiny. Syllonaut připraví, upraví a pomůže vést výuku se studenty v reálném čase.',
    ogLocale: 'cs_CZ',
  },
  en: {
    title: 'Syllonaut — AI navigator for interactive teaching',
    description: 'Turn an idea into a live interactive lesson. Syllonaut helps teachers create, refine and run engaging lessons in real time.',
    ogLocale: 'en_US',
  },
};

export function generateStaticParams() {
  return [{ locale: 'cs' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = normalizeUiLocale(rawLocale);
  if (!locale) return {};

  const copy = metadataByLocale[locale];
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        cs: '/cs',
        en: '/en',
        'x-default': '/en',
      },
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: `/${locale}`,
      siteName: 'Syllonaut',
      locale: copy.ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LocalizedHome({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!normalizeUiLocale(rawLocale)) notFound();

  return (
    <>
      <LandingPage />
      <LandingBackToTop />
    </>
  );
}
