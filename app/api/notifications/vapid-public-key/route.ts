import { NextResponse } from "next/server";
import { webPushConfigured, webPushPublicKey } from "@/lib/push";

export async function GET() {
  return NextResponse.json({
    enabled: webPushConfigured(),
    publicKey: webPushPublicKey(),
  });
}
