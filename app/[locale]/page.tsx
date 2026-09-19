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
    title: 'Syllonaut — Od nápadu k odučené hodině s AI',
    description: 'Od nápadu k odučené hodině s AI. Syllonaut připraví a upraví interaktivní lekci a pomůže ji rovnou vést se studenty.',
    ogLocale: 'cs_CZ',
  },
  en: {
    title: 'Syllonaut — From idea to live teaching with AI',
    description: 'From idea to live teaching with AI. Syllonaut creates and refines interactive lessons and helps teachers run them with students in real time.',
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
