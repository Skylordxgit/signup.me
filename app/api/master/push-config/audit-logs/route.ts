import { masterJson } from "@/lib/auth";
import { getSystemPushAuditLogs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return masterJson(async () => {
    const logs = await getSystemPushAuditLogs(50);
    return {
      success: true,
      logs,
    };
  });
}
