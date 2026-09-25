import { NextRequest } from "next/server";
import { masterJson } from "@/lib/auth";
import {
  getActiveWebPushConfig,
  getPushHealth,
  savePushConfig,
  scanEnvPushConfig,
} from "@/lib/pushConfig";
import { getSystemPushConfig } from "@/lib/store";
import type { SystemPushConfigSafe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return masterJson(async () => {
    const rawDb = await getSystemPushConfig();
    let dbConfig: SystemPushConfigSafe | null = null;
    if (rawDb) {
      dbConfig = {
        ...rawDb,
        privateKeyConfigured: Boolean(rawDb.privateKeyEncrypted),
      };
    }

    const active = await getActiveWebPushConfig();
    const envScan = scanEnvPushConfig();
    const health = await getPushHealth();

    return {
      dbConfig,
      activeConfig: active
        ? {
            publicKey: active.publicKey,
            privateKeyConfigured: true,
            subject: active.subject,
            configVersion: active.configVersion,
            fingerprint: active.fingerprint,
            source: active.source,
            enabled: active.enabled,
          }
        : null,
      envScan,
      health,
    };
  });
}

export async function POST(request: NextRequest) {
  return masterJson(async (session) => {
    const body = (await request.json().catch(() => ({}))) as {
      publicKey?: string;
      privateKey?: string;
      subject?: string;
      rotateConfirmed?: boolean;
    };

    if (!body.publicKey?.trim()) {
      throw new Error("Public key is required");
    }
    if (!body.privateKey?.trim()) {
      throw new Error("Private key is required");
    }

    const result = await savePushConfig(
      {
        publicKey: body.publicKey,
        privateKey: body.privateKey,
        subject: body.subject || "mailto:admin@signup888.shop",
        rotateConfirmed: Boolean(body.rotateConfirmed),
      },
      session.email
    );

    return result;
  });
}
