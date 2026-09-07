import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { deleteBlock, duplicateBlock, updateBlock } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const block = await updateBlock(Number(id), await request.json());
    if (!block) throw new Error("Block not found");
    return block;
  });
}

export async function POST(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const block = await duplicateBlock(Number(id));
    if (!block) throw new Error("Block not found");
    return block;
  });
}

export async function DELETE(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const ok = await deleteBlock(Number(id));
    if (!ok) throw new Error("Block not found");
    return { ok: true };
  });
}
