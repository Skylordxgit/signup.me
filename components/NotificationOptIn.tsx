"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";

function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function NotificationOptIn({ slug, title }: { slug: string; title: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    if (window.localStorage.getItem(`signup888_push_prompt_${slug}`) === "dismissed") return;
    const timer = window.setTimeout(() => {
      setReady(true);
      setHidden(false);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [slug]);

  async function allow() {
    setBusy(true);
    try {
      const keyResponse = await fetch("/api/notifications/vapid-public-key");
      const keyData = await keyResponse.json() as { enabled?: boolean; publicKey?: string };
      if (!keyData.enabled || !keyData.publicKey) {
        throw new Error("Notifications are not ready yet.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        window.localStorage.setItem(`signup888_push_prompt_${slug}`, "dismissed");
        setHidden(true);
        return;
      }

      const registration = await navigator.serviceWorker.register("/push-worker.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(keyData.publicKey),
      });

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, subscription: subscription.toJSON() }),
      });
      window.localStorage.setItem(`signup888_push_prompt_${slug}`, "allowed");
      setHidden(true);
    } catch {
      window.localStorage.setItem(`signup888_push_prompt_${slug}`, "dismissed");
      setHidden(true);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    window.localStorage.setItem(`signup888_push_prompt_${slug}`, "dismissed");
    setHidden(true);
  }

  if (!ready || hidden) return null;

  return (
    <aside className="pushPrompt" role="dialog" aria-label="Turn on browser notifications">
      <button type="button" className="pushPromptClose" aria-label="Close notification prompt" onClick={dismiss}>
        <X size={16} />
      </button>
      <span className="pushPromptIcon" aria-hidden="true"><Bell size={20} /></span>
      <div>
        <strong>Get updates from {title || "this page"}</strong>
        <p>Allow browser notifications for new links, offers, and announcements.</p>
      </div>
      <button type="button" className="pushPromptAllow" disabled={busy} onClick={allow}>
        {busy ? "Opening..." : "Allow"}
      </button>
    </aside>
  );
}
