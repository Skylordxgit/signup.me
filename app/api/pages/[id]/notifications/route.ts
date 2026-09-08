import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { campaignsForPage, sendCampaign, subscriberCount } from "@/lib/push";
import { getPageById } from "@/lib/store";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const pageId = Number(id);
    const page = await getPageById(pageId);
    if (!page) throw new Error("Page not found");

    const [subscribers, campaigns] = await Promise.all([subscriberCount(pageId), campaignsForPage(pageId)]);
    return { subscribers, campaigns };
  });
}

export async function POST(request: NextRequest, { params }: Props) {
  return protectedJson(async () => {
    const { id } = await params;
    const pageId = Number(id);
    const page = await getPageById(pageId);
    if (!page) throw new Error("Page not found");

    const body = (await request.json()) as { title?: string; body?: string; url?: string };
    return sendCampaign(pageId, { title: body.title || "", body: body.body || "", url: body.url });
  });
}
