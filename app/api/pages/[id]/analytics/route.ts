import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { analyticsForPage } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  return protectedJson(async (session) => {
    const { id } = await params;
    await pageForSession(session, Number(id));
    const daysParam = request.nextUrl.searchParams.get('days');
    const days = daysParam ? (daysParam === 'all' ? 'all' : Math.min(365, Math.max(1, Number(daysParam) || 30))) : 30;
    const report = await analyticsForPage(Number(id), days);
    if (!report) throw new Error("Page not found");
    return report;
  }, 'analytics');
}
