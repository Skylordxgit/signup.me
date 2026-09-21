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
    const fromParam = request.nextUrl.searchParams.get('from') || undefined;
    const toParam = request.nextUrl.searchParams.get('to') || undefined;

    let days: number | string = 30;
    if (daysParam === 'all' || daysParam === 'today' || daysParam === 'yesterday' || daysParam === 'month') {
      days = daysParam;
    } else if (daysParam) {
      days = Math.min(365, Math.max(1, Number(daysParam) || 30));
    }

    const report = await analyticsForPage(Number(id), days, fromParam, toParam);
    if (!report) throw new Error("Page not found");
    return report;
  }, 'analytics');
}
