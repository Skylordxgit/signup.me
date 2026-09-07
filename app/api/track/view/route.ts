import { NextRequest, NextResponse } from "next/server";
import { trackView } from "@/lib/store";

export async function POST(request: NextRequest) {
  const { slug, visitorKey } = (await request.json()) as { slug?: string; visitorKey?: string };
  if (!slug || !visitorKey) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }

  const result = await trackView(
    slug,
    request.headers.get("user-agent") || "",
    request.headers.get("referer"),
    visitorKey,
  );
  return NextResponse.json(result ?? { ok: false });
}
