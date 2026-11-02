#!/usr/bin/env node

/**
 * Seethapaati production full-site crawler and QA audit.
 * Targets must be supplied explicitly; no provider or deployment is selected here.
 */

function requireHttpsUrl(name, raw, originOnly = false) {
  if (!raw) throw new Error(name + ' must be set explicitly; this audit has no default deployment target.');
  let url;
  try { url = new URL(raw); } catch { throw new Error(name + ' must be a valid absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(name + ' must use HTTPS and must not contain credentials, query parameters or fragments.');
  }
  if (originOnly && url.pathname !== '/') {
    throw new Error(name + ' must be an HTTPS origin without a path.');
  }
  return url.toString().replace(/\/+$/, '');
}

const API_BASE = requireHttpsUrl('API_BASE_URL', process.env.API_BASE_URL);
const WEB_BASE = requireHttpsUrl('WEB_BASE_URL', process.env.WEB_BASE_URL, true);
if (!API_BASE.endsWith('/api/v1')) {
  throw new Error('API_BASE_URL must end in /api/v1.');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function auditUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Seethapaati-QA-Crawler/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const status = res.status;
    const text = await res.text();

    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Strip <script> and <style> tags to avoid matching bundled JS flight data
    const bodyText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Check for 404 and error indicators in title or visible HTML
    const has404Indicator =
      status !== 200 ||
      title.includes('Delicacy Unavailable') ||
      title.includes('404') ||
      bodyText.includes('Document 404') ||
      bodyText.includes('DOCUMENT 404') ||
      bodyText.includes('Page Not Found') ||
      bodyText.includes('botanical archive or harvest page you requested does not exist') ||
      bodyText.includes('Internal Server Error') ||
      bodyText.includes('Application error: a client-side exception has occurred');

    if (status !== 200 || has404Indicator) {
      let reason = `HTTP ${status}`;
      if (has404Indicator) {
        reason += ` - HTML body contains error indicator (Title: "${title}")`;
      }
      return { url, status, pass: false, reason, title };
    }

    return { url, status, pass: true, title, length: text.length };
  } catch (err) {
    return { url, status: 0, pass: false, reason: err.message, title: '' };
  }
}

async function runAudit() {
  console.log(`\n🔍 Starting Seethapaati Full-Site QA Audit...`);
  console.log(`🌐 Target Web: ${WEB_BASE}`);
  console.log(`🔌 Target API: ${API_BASE}\n`);

  // 1. Fetch active products and categories from backend API
  console.log('📡 Discovering live products & categories from API...');
  let products = [];
  let categories = [];

  try {
    const pData = await fetchJson(`${API_BASE}/catalog/products?limit=100`);
    products = Array.isArray(pData) ? pData : pData.data || [];
    console.log(`   Found ${products.length} active products.`);
  } catch (err) {
    console.error(`   ⚠️ Failed to query products from API: ${err.message}`);
  }

  try {
    const cData = await fetchJson(`${API_BASE}/catalog/categories`);
    categories = Array.isArray(cData) ? cData : cData.data || [];
    console.log(`   Found ${categories.length} categories.`);
  } catch (err) {
    console.error(`   ⚠️ Failed to query categories from API: ${err.message}`);
  }

  // Fallbacks if API was temporarily unreachable
  const productSlugs = products.length > 0
    ? products.map((p) => p.slug)
    : [
        'one-powder-for-all',
        'abc-malt-health-mix',
        'premium-ceylon-tea-blend',
        'traditional-rasam-powder',
        'traditional-nuts-seed-blend',
      ];

  const categorySlugs = categories.length > 0
    ? categories.map((c) => c.slug)
    : [
        'spices-masalas',
        'health-mixes-beverages',
        'traditional-teas',
        'pantry-staples',
      ];

  // 2. Compile comprehensive list of routes to audit
  const staticRoutes = [
    '/',
    '/shop',
    '/about',
    '/contact',
    '/shipping',
    '/returns',
    '/terms-and-conditions',
    '/privacy-policy',
    '/cart',
    '/checkout',
    '/admin/login',
  ];

  const dynamicProductRoutes = productSlugs.map((slug) => `/shop/${slug}`);
  const legacyProductRoutes = productSlugs.map((slug) => `/product/${slug}`);
  const legacyPluralRoutes = productSlugs.map((slug) => `/products/${slug}`);
  const categoryRoutes = categorySlugs.map((slug) => `/shop?category=${encodeURIComponent(slug)}`);

  const allPaths = [
    ...staticRoutes,
    ...dynamicProductRoutes,
    ...legacyProductRoutes,
    ...legacyPluralRoutes,
    ...categoryRoutes,
  ];

  console.log(`📋 Total URLs queued for audit: ${allPaths.length}\n`);

  // 3. Concurrently audit routes with concurrency limit of 5 to avoid overwhelming free tier
  const results = [];
  const concurrency = 4;
  for (let i = 0; i < allPaths.length; i += concurrency) {
    const batch = allPaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((p) => auditUrl(`${WEB_BASE}${p}`))
    );
    for (const res of batchResults) {
      results.push(res);
      const icon = res.pass ? '✅' : '❌';
      console.log(`${icon} [${res.status}] ${res.url} ${res.pass ? `— ${res.title}` : `— FAILED: ${res.reason}`}`);
    }
  }

  // 4. Summary & Verification
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log(`\n============================================================`);
  console.log(`📊 Audit Complete: ${passed}/${total} Passed (${failed.length} Failed)`);
  console.log(`============================================================`);

  if (failed.length > 0) {
    console.error(`\n❌ Failed URLs detected:`);
    for (const f of failed) {
      console.error(`   - ${f.url}: ${f.reason}`);
    }
    process.exit(1);
  } else {
    console.log(`\n🎉 Zero 404s, zero broken routes, 100% healthy!`);
    process.exit(0);
  }
}

runAudit();
