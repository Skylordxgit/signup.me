import { NextRequest, NextResponse } from "next/server";
import { subscribe } from "@/lib/push";
import { getPublicPageBySlug } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    slug?: string;
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  };

  if (!body.slug || !body.subscription) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const page = await getPublicPageBySlug(body.slug);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    await subscribe(page.id, body.subscription, request.headers.get("user-agent") || "");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subscribe failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
