"use client";

import { useEffect } from "react";
import type { PageBlock, SmartPage } from "@/lib/types";
import type { WorkspaceBranding } from "@/lib/workspaceBrandingConstants";
import { NotificationOptIn } from "./NotificationOptIn";
import { PageRenderer } from "./PageRenderer";
import { isNotificationPromptEnabled } from "@/lib/notificationPrompt";
import { getClientGeo } from "@/lib/clientGeo";

/**
 * The public route. All page design lives in PageRenderer, which the admin
 * builder's phone preview renders too — this component only adds the analytics
 * the builder must not fire.
 */
export function PublicPage({
  page,
  preview = false,
  workspaceBranding,
}: {
  page: SmartPage;
  preview?: boolean;
  workspaceBranding?: WorkspaceBranding | null;
}) {
  useEffect(() => {
    if (preview) return;
    const visitorKey = window.localStorage.getItem("smartlink_visitor") || crypto.randomUUID();
    window.localStorage.setItem("smartlink_visitor", visitorKey);
    let timezone = "";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Ignore */ }

    void (async () => {
      const geo = await getClientGeo();
      void fetch("/api/track/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: page.slug,
          visitorKey,
          timezone,
          city: geo.city,
          country: geo.country,
        }),
      });
    })();
  }, [page.slug, preview]);

  async function track(block: PageBlock) {
    if (preview || ["heading", "text", "divider", "image", "video", "youtube"].includes(block.type)) return;
    let timezone = "";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Ignore */ }
    const geo = await getClientGeo();
    await fetch("/api/track/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pageId: page.id,
        blockId: block.id,
        timezone,
        city: geo.city,
        country: geo.country,
      }),
    });
  }

  return (
    <main className="publicExperience">
      <PageRenderer page={page} onTrack={track} preview={preview} workspaceBranding={workspaceBranding} />
      {!preview && isNotificationPromptEnabled(page.integrations.notificationPrompt) && <NotificationOptIn key={page.slug} slug={page.slug} title={page.title} settings={page.integrations.notificationPrompt} />}
    </main>
  );
}
