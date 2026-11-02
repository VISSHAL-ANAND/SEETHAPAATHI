import { SITE_URL } from '../lib/business-info';
import type { Metadata } from 'next';
import type { ProductDto } from '@seethapaati/contracts';
import { HomeClient } from '../components/storefront/HomeClient';
import { getApiBaseUrl, fetchWithRetry } from '../lib/api-client';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Seethapaati — Heirloom South Indian Staples & Handcrafted Masalas',
  description:
    'Purveyors of heirloom South Indian culinary staples, heritage masalas, cold-stone ground spice blends, and botanical malts.',
  openGraph: {
    title: 'Seethapaati — Heirloom South Indian Staples & Handcrafted Masalas',
    description:
      'Purveyors of heirloom South Indian culinary staples, heritage masalas, cold-stone ground spice blends, and botanical malts.',
    url: SITE_URL,
    siteName: 'Seethapaati',
    images: [
      {
        url: `${SITE_URL}/images/masala.jpg`,
        width: 1200,
        height: 630,
        alt: 'Seethapaati Artisanal Pantry',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Seethapaati — Heirloom South Indian Staples',
    description:
      'Purveyors of heirloom South Indian culinary staples, heritage masalas, cold-stone ground spice blends, and botanical malts.',
    images: [`${SITE_URL}/images/masala.jpg`],
  },
};

async function getProducts(): Promise<ProductDto[]> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithRetry(
      `${apiUrl}/catalog/products?limit=50`,
      { next: { revalidate: 60 } },
      2,
      8000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch (err) {
    console.error('[HomePage getProducts] Error:', (err as Error).message);
    return [];
  }
}

export default async function HomePage() {
  const products = await getProducts();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Seethapaati',
        url: SITE_URL,
        logo: `${SITE_URL}/images/logo.png`,
        description:
          'Purveyors of heirloom South Indian culinary staples, heritage masalas, cold-stone ground spice blends, and botanical malts.',
        sameAs: [
          'https://www.instagram.com/seethapaati',
          'https://twitter.com/seethapaati',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'Seethapaati',
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/shop?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient initialProducts={products} />
    </>
  );
}
