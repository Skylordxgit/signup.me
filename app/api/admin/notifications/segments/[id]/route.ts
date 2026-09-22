import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteSubscriberSegment } from "@/lib/store";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Invalid segment id" }, { status: 400 });

  const success = await deleteSubscriberSegment(id, session.workspaceId);
  return NextResponse.json({ ok: success });
}
