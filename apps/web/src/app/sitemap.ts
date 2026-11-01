import { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://seethapaati.com').replace(/\/+$/, '');
const PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 100;

type PublicProduct = {
  slug: string;
  updatedAt?: string | Date | null;
};

function getCatalogApiUrl(page: number): string {
  const configuredApiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    `${SITE_URL}/api/v1`;
  const apiBase = configuredApiUrl.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${apiBase}/api/v1/catalog/products?page=${page}&limit=${PAGE_SIZE}&sortBy=createdAt&sortDir=desc`;
}

async function fetchProductPage(page: number): Promise<{
  products: PublicProduct[];
  totalPages: number;
}> {
  const response = await fetch(getCatalogApiUrl(page), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Catalog sitemap request failed with HTTP ${response.status}`);
  }

  const body = await response.json();
  const products = Array.isArray(body?.data) ? body.data : [];
  const totalPages = Number.isInteger(body?.pagination?.totalPages)
    ? body.pagination.totalPages
    : 1;

  return { products, totalPages };
}

async function getPublicProducts(): Promise<PublicProduct[]> {
  try {
    const firstPage = await fetchProductPage(1);
    const pageCount = Math.min(Math.max(firstPage.totalPages, 1), MAX_PRODUCT_PAGES);
    const remainingPages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) => fetchProductPage(index + 2)),
    );

    return [...firstPage.products, ...remainingPages.flatMap((page) => page.products)]
      .filter((product): product is PublicProduct => typeof product?.slug === 'string' && product.slug.length > 0);
  } catch (error) {
    // Keep static pages discoverable during a temporary API outage.
    console.warn('[sitemap] Could not load the public product catalog:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [
    '',
    '/shop',
    '/about',
    '/contact',
    '/shipping',
    '/returns',
    '/terms-and-conditions',
    '/privacy-policy',
  ];

  const now = new Date();
  const staticUrls = routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));

  const products = await getPublicProducts();
  const productUrls = products.map((product) => ({
    url: `${SITE_URL}/shop/${encodeURIComponent(product.slug)}`,
    lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }));

  return [...staticUrls, ...productUrls];
}
