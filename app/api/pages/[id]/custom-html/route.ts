import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { createCustomHtmlDraft, publishCustomHtml, restoreCustomHtmlDraft } from "@/lib/customHtml";
import { saveCustomHtmlDraft, updatePage } from "@/lib/store";
import type { CustomHtmlSettings } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

async function handleSave(request: NextRequest, { params }: Props) {
  return protectedJson(async session => {
    const id = Number((await params).id);
    const page = await pageForSession(session, id);
    if (page.pageType !== "custom_html") throw new Error("This is not a Custom HTML page.");
    const body = await request.json() as { sourceHtml?: unknown; html?: unknown; restoreVersion?: unknown; publish?: unknown; action?: unknown; seo?: unknown; integrations?: unknown; notifications?: unknown; name?: unknown; slug?: unknown; status?: unknown };
    const htmlInput = typeof body.sourceHtml === "string" ? body.sourceHtml : typeof body.html === "string" ? body.html : null;
    let customHtml: CustomHtmlSettings | null = htmlInput !== null
      ? createCustomHtmlDraft(page.customHtml, htmlInput)
      : typeof body.restoreVersion === "number" && page.customHtml
        ? restoreCustomHtmlDraft(page.customHtml, body.restoreVersion)
        : page.customHtml
          ? page.customHtml
          : null;
    if (!customHtml) throw new Error("HTML source is required.");
    const shouldPublish = body.publish === true || body.action === "save_and_publish" || body.action === "publish";
    if (shouldPublish) customHtml = publishCustomHtml(customHtml);
    const saved = await saveCustomHtmlDraft(id, customHtml);
    if (!saved) throw new Error("Custom HTML page not found.");
    if (body.seo || body.integrations || body.notifications || body.name || body.slug || body.status || shouldPublish) {
      return updatePage(id, {
        name: typeof body.name === "string" ? body.name : saved.name,
        slug: typeof body.slug === "string" ? body.slug : saved.slug,
        status: shouldPublish ? "published" : body.status === "disabled" ? "disabled" : saved.status,
        seo: typeof body.seo === "object" && body.seo ? { ...saved.seo, ...body.seo } : saved.seo,
        integrations: typeof body.integrations === "object" && body.integrations
          ? { ...saved.integrations, ...body.integrations, ...(body.notifications ? { notificationPrompt: body.notifications } : {}) }
          : body.notifications
            ? { ...saved.integrations, notificationPrompt: body.notifications }
            : saved.integrations,
      });
    }
    return saved;
  });
}

export async function PUT(request: NextRequest, props: Props) {
  return handleSave(request, props);
}

export async function POST(request: NextRequest, props: Props) {
  return handleSave(request, props);
}
