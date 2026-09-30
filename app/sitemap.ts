import type { MetadataRoute } from 'next';

// Mirrors metadataBase in app/layout.tsx and the canonical/alternates in each
// page's generateMetadata.
const BASE_URL = 'https://www.syllonaut.com';
const LOCALES = ['cs', 'en'] as const;
const PUBLIC_PATHS = ['', '/pricing', '/requirements', '/terms', '/gdpr', '/dpa', '/withdrawal', '/complaint', '/referral'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) => {
    const languages = {
      cs: `${BASE_URL}/cs${path}`,
      en: `${BASE_URL}/en${path}`,
      'x-default': `${BASE_URL}/en${path}`,
    };
    return LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}${path}`,
      alternates: { languages },
    }));
  });
}
