import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { deletePage, getPageById, updatePage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const page = await getPageById(Number(id));
    if (!page) throw new Error("Page not found");
    return page;
  });
}

export async function PUT(request: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const page = await updatePage(Number(id), await request.json());
    if (!page) throw new Error("Page not found");
    return page;
  });
}

export async function DELETE(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const ok = await deletePage(Number(id));
    if (!ok) throw new Error("Page not found");
    return { ok: true };
  });
}
