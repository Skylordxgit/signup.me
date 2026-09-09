import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { deletePage, updatePage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, { params }: Props) {
  return protectedJson(async (session) => pageForSession(session, Number((await params).id)));
}

export async function PUT(request: NextRequest, { params }: Props) {
  return protectedJson(async (session) => {
    const { id } = await params;
    await pageForSession(session, Number(id));
    const page = await updatePage(Number(id), await request.json());
    if (!page) throw new Error("Page not found");
    return page;
  });
}

export async function DELETE(_: NextRequest, { params }: Props) {
  return protectedJson(async (session) => {
    const { id } = await params;
    await pageForSession(session, Number(id));
    const ok = await deletePage(Number(id));
    if (!ok) throw new Error("Page not found");
    return { ok: true };
  });
}
