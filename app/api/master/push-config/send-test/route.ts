import { NextRequest } from "next/server";
import { masterJson } from "@/lib/auth";
import { sendTestPushToDevice } from "@/lib/pushConfig";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return masterJson(async (session) => {
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      body?: string;
      url?: string;
    };

    const result = await sendTestPushToDevice(body, session.email);
    return result;
  });
}
