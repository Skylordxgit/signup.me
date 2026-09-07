import { NextRequest, NextResponse } from "next/server";
import { trackClick } from "@/lib/store";

export async function POST(request: NextRequest) {
  const { pageId, blockId } = (await request.json()) as { pageId?: number; blockId?: number };
  if (!pageId || !blockId) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }

  const result = await trackClick(
    Number(pageId),
    Number(blockId),
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
  );
  return NextResponse.json(result ?? { ok: false });
}
