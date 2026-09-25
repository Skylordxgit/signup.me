import { masterJson } from "@/lib/auth";
import { syncEnvToDb } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function POST() {
  return masterJson(async (session) => {
    const result = await syncEnvToDb(session.email);
    return result;
  });
}
