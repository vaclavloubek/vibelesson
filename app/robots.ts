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
        '/lessons/',
        '/sessions/',
        '/student/',
        '/s/',
        '/join/',
        '/school/',
        '/new',
        '/subscription',
      ],
    },
    sitemap: 'https://www.syllonaut.com/sitemap.xml',
  };
}
