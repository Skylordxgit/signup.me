import { NextRequest } from "next/server";
import { masterJson } from "@/lib/auth";
import { registerTestDevice } from "@/lib/pushConfig";
import { getSystemTestDevice } from "@/lib/store";
import { isPushSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return masterJson(async () => {
    const device = await getSystemTestDevice();
    return {
      success: true,
      registered: Boolean(device),
      device,
      testDevice: device,
    };
  });
}

export async function POST(request: NextRequest) {
  return masterJson(async (session) => {
    const body = (await request.json().catch(() => ({}))) as {
      subscription?: unknown;
      endpoint?: string;
      keys?: { auth?: string; p256dh?: string };
      userAgent?: string;
    };

    const sub = body.subscription || (body.endpoint && body.keys ? { endpoint: body.endpoint, keys: body.keys } : null);

    if (!isPushSubscription(sub)) {
      throw new Error("Invalid push subscription record");
    }

    const saved = await registerTestDevice(
      sub,
      body.userAgent || request.headers.get("user-agent") || undefined,
      session.email
    );

    return {
      success: true,
      message: "Test device registered successfully.",
      device: saved,
      testDevice: saved,
    };
  });
}
