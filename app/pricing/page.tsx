import type { Metadata } from 'next';
import PricingPage from '@/components/PricingPage';

const title = 'Ceník — Syllonaut';
const description = 'Ceník Syllonautu pro jednotlivé učitele a školy. Začněte zdarma a porovnejte připravované placené plány.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title,
    description,
    url: '/pricing',
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

type PricingRouteProps = {
  searchParams: Promise<{ signup?: string | string[] }>;
};

export default async function Pricing({ searchParams }: PricingRouteProps) {
  const params = await searchParams;
  const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;

  return <PricingPage startSignup={signup === '1'} />;
}
