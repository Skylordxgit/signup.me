import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { workspacePermissions } from "@/lib/permissions";
import { getWorkspace } from "@/lib/workspaces";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const workspace = await getWorkspace(session.workspaceId);
  return NextResponse.json({
    email: session.email,
    role: session.role,
    // A master session carries every permission, so the admin shell never hides
    // a section from it.
    permissions: session.isMaster ? [...workspacePermissions] : session.permissions ?? [],
    isMaster: session.isMaster ?? false,
    workspaceId: session.workspaceId,
    workspaceName: workspace?.name || 'Main workspace',
  });
}
