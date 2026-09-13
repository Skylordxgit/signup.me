import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { exportFileName, exportPages } from '@/lib/pageTransfer';

export async function POST(request: NextRequest) {
  // Workspace owners and admins only; a master session has no workspace and is
  // rejected here, so it cannot export workspace pages.
  const session = await requireAdmin('pages');
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json() as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
    const data = await exportPages(session, ids);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${exportFileName()}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not export the selected pages.' }, { status: 400 });
  }
}
