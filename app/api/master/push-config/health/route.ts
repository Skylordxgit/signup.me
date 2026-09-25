import { masterJson } from "@/lib/auth";
import { getPushHealth } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  return masterJson(async () => {
    const health = await getPushHealth();
    return {
      success: true,
      health,
    };
  });
}
