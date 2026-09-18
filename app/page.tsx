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
    ? 'Syllonaut — AI navigator for interactive teaching'
    : 'Syllonaut — AI navigátor pro interaktivní výuku';
  const description = english
    ? 'Turn an idea into a live interactive lesson. Syllonaut helps teachers create, refine and run engaging lessons in real time.'
    : 'Z nápadu do živé interaktivní hodiny. Syllonaut připraví, upraví a pomůže vést výuku se studenty v reálném čase.';

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
