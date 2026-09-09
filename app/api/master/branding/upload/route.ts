import { NextRequest, NextResponse } from 'next/server';
import { requireMaster } from '@/lib/auth';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspaceConstants';
import { isSafeSvg, maxUploadBytes, sniffImage, storeUpload } from '@/lib/uploads';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = await requireMaster();
  if (!session) return fail('Master admin access required', 401);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared && declared > maxUploadBytes * 1.1) return fail(`File is too large. Maximum size is ${Math.round(maxUploadBytes / 1024 / 1024)}MB.`, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Could not read the upload.', 400);
  }

  const category = String(form.get('category') || '');
  if (category !== 'logo' && category !== 'favicon') return fail('Branding uploads must be logo or favicon.', 400);
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file was provided.', 400);
  if (file.size === 0) return fail('The file is empty.', 400);
  if (file.size > maxUploadBytes) return fail(`File is too large. Maximum size is ${Math.round(maxUploadBytes / 1024 / 1024)}MB.`, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail('Unsupported file type. Use JPG, PNG, WEBP, SVG or ICO.', 415);
  if (kind.mime === 'image/svg+xml' && !isSafeSvg(bytes)) return fail('This SVG contains scripting and was rejected.', 415);
  if (kind.mime === 'image/x-icon' && category !== 'favicon') return fail('ICO files can only be used for a favicon.', 415);

  try {
    return NextResponse.json(await storeUpload(category, bytes, kind, DEFAULT_WORKSPACE_ID), { status: 201 });
  } catch {
    return fail('Could not save the image to persistent storage.', 500);
  }
}
