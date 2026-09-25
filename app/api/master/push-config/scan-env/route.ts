import { masterJson } from "@/lib/auth";
import { scanEnvPushConfig } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function POST() {
  return masterJson(async () => {
    const result = scanEnvPushConfig();
    return {
      success: true,
      env: result,
    };
  });
}
