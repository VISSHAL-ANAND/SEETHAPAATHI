#!/usr/bin/env node

/**
 * Safe API preflight for a dedicated staging deployment.
 * Checks readiness, catalog, HttpOnly-cookie login/session and logout only.
 * It never registers users, creates carts/orders or contacts payment providers.
 */

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing required staging setting: ' + name);
  return value;
}

const rawBase = required('STAGING_API_BASE_URL');
let apiUrl;
try { apiUrl = new URL(rawBase); } catch {
  throw new Error('STAGING_API_BASE_URL must be a valid absolute URL.');
}
if (
  apiUrl.protocol !== 'https:' ||
  apiUrl.username ||
  apiUrl.password ||
  apiUrl.search ||
  apiUrl.hash ||
  !apiUrl.pathname.replace(/\/+$/, '').endsWith('/api/v1')
) {
  throw new Error('STAGING_API_BASE_URL must be an HTTPS API URL ending in /api/v1, without credentials, query or fragment.');
}
const API_BASE = apiUrl.toString().replace(/\/+$/, '');
const TEST_EMAIL = required('STAGING_TEST_EMAIL');
const TEST_PASSWORD = required('STAGING_TEST_PASSWORD');
if (process.env.STAGING_CONFIRM_API_SMOKE !== 'true') {
  throw new Error('Set STAGING_CONFIRM_API_SMOKE=true only after confirming this URL targets staging, not production.');
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(API_BASE + path, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(label + ': expected HTTP ' + expected + ', received HTTP ' + response.status + '.');
  }
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  return [response.headers.get('set-cookie') || ''];
}

async function main() {
  console.log('Checking staging API readiness...');
  const ready = await request('/health/ready');
  expectStatus(ready, 200, 'API readiness');
  const readyBody = await ready.json();
  if (readyBody.status !== 'ready') throw new Error('API readiness response is not ready.');

  console.log('Checking public catalog...');
  const catalog = await request('/catalog/products?limit=1');
  expectStatus(catalog, 200, 'Public catalog');
  const catalogBody = await catalog.json();
  const products = Array.isArray(catalogBody) ? catalogBody : catalogBody.data;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Catalog response did not contain at least one active product.');
  }

  console.log('Checking staging test-account login and cookie flags...');
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  expectStatus(login, 201, 'Staging test login');
  const cookieHeaders = getSetCookieHeaders(login);
  const fullCookie = cookieHeaders.find(value => /^access_token=/i.test(value));
  if (!fullCookie) throw new Error('Login response did not set the expected session cookie.');
  const lowerCookie = fullCookie.toLowerCase();
  for (const flag of ['httponly', 'secure', 'samesite=lax', 'path=/']) {
    if (!lowerCookie.includes(flag)) throw new Error('Session cookie is missing required flag: ' + flag + '.');
  }
  const authCookie = fullCookie.split(';', 1)[0];

  console.log('Checking authenticated session...');
  const me = await request('/auth/me', { headers: { Cookie: authCookie } });
  expectStatus(me, 200, 'Authenticated session');

  console.log('Checking logout and unauthenticated access...');
  const logout = await request('/auth/logout', {
    method: 'POST',
    headers: { Cookie: authCookie },
  });
  expectStatus(logout, 201, 'Logout');
  const unauthenticated = await request('/auth/me');
  expectStatus(unauthenticated, 401, 'Unauthenticated session');

  console.log('Staging API preflight passed: readiness, catalog, cookie login, session and logout.');
}

main().catch(error => {
  console.error('Staging API preflight failed: ' + error.message);
  process.exitCode = 1;
});
