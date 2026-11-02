import type { ApiResponse, ApiErrorResponse } from '@seethapaati/contracts';

export function getApiBaseUrl(): string {
  // In the browser, use relative '/api/v1'. next.config.ts rewrites this path to
  // the configured API service while keeping the browser request same-origin, so
  // HttpOnly session cookies remain first-party.
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }

  // During SSR (Server-Side Rendering in Node), call the backend directly
  let base = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  base = base.trim().replace(/\/+$/, '');
  if (!base.endsWith('/api/v1')) {
    base = `${base}/api/v1`;
  }
  return base;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
  timeoutMs = 8000
): Promise<Response> {
  let lastError: Error | null = null;
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  const hasIdempotencyKey = Boolean(
    headers.get('Idempotency-Key') || headers.get('X-Idempotency-Key')
  );
  const retrySafe = ['GET', 'HEAD', 'OPTIONS'].includes(method) || hasIdempotencyKey;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 404) {
        return res;
      }
      if (attempt < retries && retrySafe && res.status >= 500) {
        console.warn(`[fetchWithRetry] Attempt ${attempt + 1} to ${url} failed with status ${res.status}. Retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt < retries && retrySafe) {
        console.warn(`[fetchWithRetry] Attempt ${attempt + 1} to ${url} errored (${err?.name || err?.message}). Retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        // A network failure after a mutation may still mean the server committed it.
        // Do not replay unsafe requests without an explicit idempotency key.
        break;
      }
    }
  }
  console.error(`[fetchWithRetry] All ${retries + 1} attempts to ${url} failed:`, lastError?.message);
  throw lastError || new Error(`Failed to fetch from ${url}`);
}

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public status = 0
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (cleanEndpoint.startsWith('/api/v1/')) {
    cleanEndpoint = cleanEndpoint.replace(/^\/api\/v1/, '');
  }
  const url = `${baseUrl}${cleanEndpoint}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Authentication is cookie-only: the API validates the HttpOnly session cookie.
  // Remove tokens persisted by older clients; they are no longer read or sent.
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('seethapaati_access_token');
      const cartId = localStorage.getItem('seethapaati_guest_cart_id');
      if (cartId) {
        defaultHeaders['X-Cart-Id'] = cartId;
      }
    } catch {
      // ignore unavailable browser storage
    }
  }

  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  let json: any = null;

  if (contentType.includes('application/json')) {
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  } else {
    const text = await response.text();
    if (!response.ok) {
      throw new ApiClientError(
        `HTTP_${response.status}`,
        text || `Request failed with HTTP status ${response.status}`,
        undefined,
        response.status
      );
    }
    return (text as unknown) as T;
  }

  if (!response.ok || (json && json.success === false)) {
    const errorJson = json as ApiErrorResponse | null;
    let errorMessage: string | undefined;

    if (errorJson?.error) {
      const err = errorJson.error;
      if (Array.isArray(err.message)) {
        errorMessage = err.message.join(', ');
      } else if (typeof err.message === 'string' && err.message !== 'Input validation failed') {
        errorMessage = err.message;
      }

      // If message is generic or empty, inspect details for field errors
      if ((!errorMessage || errorMessage === 'Input validation failed') && err.details) {
        if (Array.isArray(err.details)) {
          const detailMsgs = err.details
            .map((d: any) => {
              if (typeof d === 'string') return d;
              if (d && typeof d === 'object') {
                return d.message ? (d.field ? `${d.field}: ${d.message}` : d.message) : JSON.stringify(d);
              }
              return String(d);
            })
            .filter(Boolean);
          if (detailMsgs.length > 0) {
            errorMessage = detailMsgs.join(', ');
          }
        }
      }

      if (!errorMessage && typeof err.message === 'string') {
        errorMessage = err.message;
      }
    }

    throw new ApiClientError(
      errorJson?.error?.code || `HTTP_${response.status}`,
      errorMessage || `Request failed with status ${response.status}`,
      errorJson?.error?.details,
      response.status
    );
  }

  const successJson = json as ApiResponse<T>;
  const data = successJson?.data !== undefined ? successJson.data : (json as T);

  // Persist only the guest cart identifier; authentication remains in the HttpOnly cookie.
  if (typeof window !== 'undefined' && data && typeof data === 'object' && 'cartId' in data) {
    try {
      if (typeof (data as any).cartId === 'string') {
        localStorage.setItem('seethapaati_guest_cart_id', (data as any).cartId);
      }
    } catch {
      // ignore unavailable browser storage
    }
  }

  return data;
}
