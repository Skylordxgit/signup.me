import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { duplicatePage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const page = await duplicatePage(Number(id));
    if (!page) throw new Error("Page not found");
    return page;
  });
}
