import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const API_BASE_URL = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ''
).trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');

class UploadPayloadTooLargeError extends Error {
  constructor() {
    super('Upload request exceeds the configured size limit');
    this.name = 'UploadPayloadTooLargeError';
  }
}

/**
 * Enforce the request limit while consuming the stream. Checking Content-Length
 * alone is insufficient because it may be absent or untrusted.
 */
async function readBoundedRequestBody(req: NextRequest, maxBytes: number): Promise<Buffer> {
  if (!req.body) return Buffer.alloc(0);

  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new UploadPayloadTooLargeError();
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function detectImage(buffer: Buffer): { extension: 'png' | 'jpg' | 'webp'; mime: string } | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: 'png', mime: 'image/png' };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', mime: 'image/webp' };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Reject cross-origin form submissions before using the ambient session cookie.
    const requestOrigin = req.headers.get('origin');
    const configuredOrigins =
      process.env.UPLOAD_ALLOWED_ORIGINS ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';
    const allowedOrigins = configuredOrigins
      .split(',')
      .map((origin) => {
        try {
          return new URL(origin.trim()).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => Boolean(origin));
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
    }

    // Validate the signed HttpOnly session with the API; a cookie's mere presence
    // is not proof of authentication or authorization.
    const cookie = req.headers.get('cookie');
    if (!cookie) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!API_BASE_URL) {
      return NextResponse.json(
        { success: false, error: 'API service is not configured' },
        { status: 503 },
      );
    }

    const authResponse = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!authResponse.ok) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const authBody = await authResponse.json();
    const permissions: string[] = authBody?.data?.permissions ?? [];
    if (!permissions.includes('products.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const declaredLength = req.headers.get('content-length');
    if (declaredLength) {
      const contentLength = Number(declaredLength);
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
        return NextResponse.json(
          { success: false, error: 'Upload request exceeds the 5MB image limit' },
          { status: 413 },
        );
      }
    }

    // Read with a hard byte cap before multipart parsing to avoid unbounded
    // request buffering when Content-Length is absent or invalid.
    const requestBody = await readBoundedRequestBody(req, MAX_REQUEST_BYTES);
    const boundedRequest = new Request(req.url, {
      method: 'POST',
      headers: req.headers,
      body: new Uint8Array(requestBody),
    });
    const formData = await boundedRequest.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File must be non-empty and no larger than 5MB' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectImage(buffer);
    if (!detected) {
      return NextResponse.json(
        { success: false, error: 'Only valid PNG, JPEG, and WEBP images are allowed' },
        { status: 400 },
      );
    }

    const filename = `${randomUUID()}.${detected.extension}`;
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer, { flag: 'wx' });

    return NextResponse.json({
      success: true,
      url: `/uploads/${filename}`,
      mimeType: detected.mime,
    });
  } catch (error) {
    if (error instanceof UploadPayloadTooLargeError) {
      return NextResponse.json(
        { success: false, error: 'Upload request exceeds the 5MB image limit' },
        { status: 413 },
      );
    }

    console.error('Failed to upload image:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 },
    );
  }
}
