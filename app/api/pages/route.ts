import { NextRequest, NextResponse } from "next/server";
import { protectedJson, requireAdmin } from "@/lib/auth";
import { canAccess } from '@/lib/permissions';
import { createPage, listPages } from "@/lib/store";

export async function GET() {
  // Scoped to the session's workspace, never a workspace id from the client.
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!['pages', 'analytics', 'notifications'].some(permission => canAccess(session, permission as 'pages' | 'analytics' | 'notifications'))) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  const pages = await listPages(session.workspaceId);
  return NextResponse.json(canAccess(session, 'analytics') ? pages : pages.map(page => ({ ...page, views: 0, clicks: 0, uniqueVisitors: 0 })));
}

export async function POST(request: NextRequest) {
  return protectedJson(async (session) => {
    const body = await request.json() as Record<string, unknown> | null;
    if (!body || typeof body.name !== "string" || !body.name.trim()) throw new Error("Page name is required");
    for (const key of ["slug", "title", "bio", "profileImage"]) {
      if (body[key] !== undefined && typeof body[key] !== "string") throw new Error(`Invalid ${key}`);
    }
    return createPage({
      name: body.name,
      slug: (body.slug as string) || "",
      title: (body.title as string) || "",
      bio: (body.bio as string) || "",
      profileImage: (body.profileImage as string) || "",
      workspaceId: session.isMaster && typeof body.workspaceId === "string" ? body.workspaceId : session.workspaceId,
    });
  });
}
