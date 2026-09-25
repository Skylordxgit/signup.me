import { masterJson } from "@/lib/auth";
import { compareEnvVsDb } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  return masterJson(async () => {
    const comparison = await compareEnvVsDb();
    return {
      success: true,
      comparison,
    };
  });
}
