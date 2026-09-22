import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteNotificationTemplate } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, { params }: Props) {
  const session = await requireAdmin("notifications");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const success = await deleteNotificationTemplate(id, session.workspaceId);
  return NextResponse.json({ ok: success });
}
