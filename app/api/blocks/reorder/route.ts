import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { reorderBlocks } from "@/lib/store";

export async function POST(request: NextRequest) {
  return protectedJson(async (session) => {
    const { pageId, blockIds } = (await request.json()) as { pageId: number; blockIds: number[] };
    await pageForSession(session, Number(pageId));
    const page = await reorderBlocks(Number(pageId), blockIds.map(Number));
    if (!page) throw new Error("Page not found");
    return page;
  });
}
