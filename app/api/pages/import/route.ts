import { NextRequest } from 'next/server';
import { protectedJson } from '@/lib/auth';
import { importPages, parseExport } from '@/lib/pageTransfer';

/* Embedded images make an export large, but not unbounded. */
const maxImportBytes = 32 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // protectedJson supplies the workspace session, and the import always writes
  // to session.workspaceId — never to a workspace named in the file.
  return protectedJson(async (session) => {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared && declared > maxImportBytes) {
      throw new Error(`This export is larger than the ${Math.round(maxImportBytes / 1024 / 1024)}MB import limit.`);
    }

    const body = await request.text();
    if (body.length > maxImportBytes) {
      throw new Error(`This export is larger than the ${Math.round(maxImportBytes / 1024 / 1024)}MB import limit.`);
    }

    let parsed: unknown;
    try { parsed = JSON.parse(body) as unknown; }
    catch { throw new Error('This file is not valid JSON.'); }

    const payload = parsed as { file?: unknown; keepStatus?: unknown };
    const keepStatus = payload?.keepStatus === true;
    // The client posts { file, keepStatus }; a raw export file also works.
    const data = parseExport(payload && typeof payload === 'object' && 'file' in payload ? payload.file : parsed);
    return importPages(session, data, { keepStatus });
  });
}
