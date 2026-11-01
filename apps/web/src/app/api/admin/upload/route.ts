import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const API_BASE_URL = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://seethapaati-api.onrender.com'
).trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');

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
    // Validate the signed HttpOnly session with the API; a cookie's mere presence
    // is not proof of authentication or authorization.
    const cookie = req.headers.get('cookie');
    if (!cookie) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const authResponse = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
    });

    if (!authResponse.ok) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const authBody = await authResponse.json();
    const permissions: string[] = authBody?.data?.permissions ?? [];
    if (!permissions.includes('products.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const formData = await req.formData();
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
    console.error('Failed to upload image:', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 },
    );
  }
}
