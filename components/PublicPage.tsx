"use client";

import { useEffect } from "react";
import type { PageBlock, SmartPage } from "@/lib/types";
import { NotificationPrompt } from "./NotificationPrompt";
import { PageRenderer } from "./PageRenderer";

/**
 * The public route. All page design lives in PageRenderer, which the admin
 * builder's phone preview renders too — this component only adds the analytics
 * the builder must not fire.
 */
export function PublicPage({ page, preview = false }: { page: SmartPage; preview?: boolean }) {
  useEffect(() => {
    if (preview) return;
    const visitorKey = window.localStorage.getItem("smartlink_visitor") || crypto.randomUUID();
    window.localStorage.setItem("smartlink_visitor", visitorKey);
    void fetch("/api/track/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: page.slug, visitorKey }),
    });
  }, [page.slug, preview]);

  async function track(block: PageBlock) {
    if (preview || ["heading", "text", "divider", "image", "video"].includes(block.type)) return;
    await fetch("/api/track/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId: page.id, blockId: block.id }),
    });
  }

  return (
    <main className="publicExperience">
      <PageRenderer page={page} onTrack={track} />
      {!preview && <NotificationPrompt page={page} />}
    </main>
  );
}
