import { NextResponse } from "next/server";
import { getRuntimePushPublicConfig } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getRuntimePushPublicConfig();
    return NextResponse.json({
      enabled: config.enabled,
      publicKey: config.publicKey,
      configVersion: config.configVersion,
      fingerprint: config.fingerprint,
    });
  } catch (error) {
    return NextResponse.json(
      { enabled: false, publicKey: "", configVersion: 0, fingerprint: "" },
      { status: 500 }
    );
  }
}
