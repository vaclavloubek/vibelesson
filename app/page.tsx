import type { Metadata } from 'next';
import { headers } from 'next/headers';
import LandingBackToTop from '@/components/LandingBackToTop';
import LandingPage from '@/components/LandingPage';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'en';
  const english = locale === 'en';
  const title = english
    ? 'Syllonaut — From idea to live teaching with AI'
    : 'Syllonaut — Od nápadu k odučené hodině s AI';
  const description = english
    ? 'From idea to live teaching with AI. Syllonaut creates and refines interactive lessons and helps teachers run them with students in real time.'
    : 'Od nápadu k odučené hodině s AI. Syllonaut připraví a upraví interaktivní lekci a pomůže ji rovnou vést se studenty.';

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: { cs: '/cs', en: '/en', 'x-default': '/en' },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      siteName: 'Syllonaut',
      locale: english ? 'en_US' : 'cs_CZ',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function Home() {
  return (
    <>
      <LandingPage />
      <LandingBackToTop />
    </>
  );
}
