import type { NextConfig } from 'next';

function getApiRewriteDestination(): string | null {
  const configured = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Set INTERNAL_API_URL or NEXT_PUBLIC_API_URL so browser /api/v1 requests can reach the API.');
    }
    return null;
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(configured);
  } catch {
    throw new Error('INTERNAL_API_URL or NEXT_PUBLIC_API_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
    throw new Error('The configured API URL must use HTTP(S) and must not contain credentials, query parameters, or a fragment.');
  }

  let apiPath = apiUrl.pathname.replace(/\/+$/, '');
  if (!apiPath.endsWith('/api/v1')) {
    apiPath = `${apiPath}/api/v1`;
  }

  return `${apiUrl.origin}${apiPath}/:path*`;
}

const nextConfig: NextConfig = {
  async rewrites() {
    const destination = getApiRewriteDestination();
    if (!destination) return [];

    return [
      {
        source: '/api/v1/:path*',
        destination,
      },
    ];
  },
};

export default nextConfig;
