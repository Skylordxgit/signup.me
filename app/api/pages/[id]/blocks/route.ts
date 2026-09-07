import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { createBlock } from "@/lib/store";
import type { BlockType } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const { type } = (await request.json()) as { type: BlockType };
    const block = await createBlock(Number(id), type);
    if (!block) throw new Error("Page not found");
    return block;
  });
}
