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
      device: device
        ? {
            id: device.id,
            endpointHash: device.endpointHash,
            userAgent: device.userAgent,
            createdAt: device.createdAt,
            updatedAt: device.updatedAt,
          }
        : null,
    };
  });
}

export async function POST(request: NextRequest) {
  return masterJson(async (session) => {
    const body = (await request.json().catch(() => ({}))) as {
      subscription?: unknown;
      userAgent?: string;
    };

    if (!isPushSubscription(body.subscription)) {
      throw new Error("Invalid push subscription record");
    }

    const saved = await registerTestDevice(
      body.subscription,
      body.userAgent || request.headers.get("user-agent") || undefined,
      session.email
    );

    return {
      success: true,
      message: "Test device registered successfully.",
      device: {
        id: saved.id,
        endpointHash: saved.endpointHash,
        userAgent: saved.userAgent,
      },
    };
  });
}
