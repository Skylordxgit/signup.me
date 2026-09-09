import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { duplicatePage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(_: NextRequest, { params }: Props) {
  return protectedJson(async (session) => {
    const { id } = await params;
    await pageForSession(session, Number(id));
    const page = await duplicatePage(Number(id));
    if (!page) throw new Error("Page not found");
    return page;
  });
}
