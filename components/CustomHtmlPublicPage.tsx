"use client";

import { useEffect, useRef } from "react";
import type { SmartPage } from "@/lib/types";
import { NotificationOptIn } from "./NotificationOptIn";
import { isNotificationPromptEnabled } from "@/lib/notificationPrompt";

export function CustomHtmlPublicPage({ page }: { page: SmartPage }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const messageToken = useRef(crypto.randomUUID()).current;
  // This script is platform-authored. It runs in an opaque sandbox and can only
  // report link clicks to its parent; user source is sanitized before reaching it.
  const html = `${page.customHtml?.publishedHtml || ""}<script>document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(a)parent.postMessage({type:'smartlink-html-click',token:${JSON.stringify(messageToken)},href:a.href},'*')},true)<\/script>`;
  useEffect(() => {
    const visitorKey = window.localStorage.getItem("smartlink_visitor") || crypto.randomUUID();
    window.localStorage.setItem("smartlink_visitor", visitorKey);
    void fetch("/api/track/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: page.slug, visitorKey }) });
  }, [page.slug]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== 'null' || event.data?.type !== "smartlink-html-click" || event.data.token !== messageToken || typeof event.data.href !== 'string') return;
      void fetch("/api/track/html-click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageId: page.id, href: event.data.href }) });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [messageToken, page.id]);
  return <main className="customHtmlPublic">
    <iframe ref={frameRef} title={page.title || page.name} sandbox="allow-scripts allow-popups" srcDoc={html} className="customHtmlFrame" />
    {isNotificationPromptEnabled(page.integrations.notificationPrompt) && <NotificationOptIn slug={page.slug} title={page.title} settings={page.integrations.notificationPrompt} />}
  </main>;
}
