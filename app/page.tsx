import type { Metadata } from 'next';
import LandingBackToTop from '@/components/LandingBackToTop';
import LandingPage from '@/components/LandingPage';

const title = 'Syllonaut — AI navigátor pro interaktivní výuku';
const description = 'Z nápadu do živé interaktivní hodiny. Syllonaut připraví, upraví a pomůže vést výuku se studenty v reálném čase.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Syllonaut',
    locale: 'cs_CZ',
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

export default function Home() {
  return (
    <>
      <LandingPage />
      <LandingBackToTop />
    </>
  );
}
