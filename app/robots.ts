import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/auth/',
        // No trailing slash: /lessons, /join and /school are pages themselves.
        '/lessons',
        '/sessions/',
        '/student/',
        '/s/',
        '/join',
        '/school',
        '/new',
        '/subscription',
        // Locale-prefixed private pages under app/[locale].
        '/cs/subscription',
        '/en/subscription',
        '/cs/terms/accept',
        '/en/terms/accept',
      ],
    },
    sitemap: 'https://www.syllonaut.com/sitemap.xml',
  };
}
