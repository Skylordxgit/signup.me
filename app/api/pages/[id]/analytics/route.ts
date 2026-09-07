import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { analyticsForPage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const report = await analyticsForPage(Number(id));
    if (!report) throw new Error("Page not found");
    return report;
  });
}
