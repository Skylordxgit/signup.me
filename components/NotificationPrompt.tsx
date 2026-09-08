"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { SmartPage } from "@/lib/types";

const showDelayMs = 1500;

function dismissedKey(slug: string) {
  return `smartlink_push_dismissed_${slug}`;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Big, centred "allow notifications" ask shown once per browser on the public
 * page. Sized to the same phone-width column as the rest of the page (see
 * .pushPromptCard's max-width) so it reads as part of this one mobile screen
 * on both an actual phone and a desktop browser showing the simulated one.
 */
export function NotificationPrompt({ page }: { page: SmartPage }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (page.integrations.pushEnabled === false) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;
    if (window.localStorage.getItem(dismissedKey(page.slug))) return;

    const timer = window.setTimeout(() => setVisible(true), showDelayMs);
    return () => window.clearTimeout(timer);
  }, [page.integrations.pushEnabled, page.slug]);

  function dismiss() {
    try {
      window.localStorage.setItem(dismissedKey(page.slug), "1");
    } catch {
      /* private browsing — the prompt may reappear next visit, which is fine */
    }
    setVisible(false);
  }

  async function allow() {
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const keyResponse = await fetch("/api/push/vapid-key");
      const { publicKey } = (await keyResponse.json()) as { publicKey: string };

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: page.slug, subscription: subscription.toJSON() }),
      });

      dismiss();
    } catch {
      setError("Could not enable notifications. Please try again.");
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="pushPromptBackdrop" role="dialog" aria-modal="true" aria-label="Allow notifications">
      <div className="pushPromptCard">
        <div className="pushPromptIcon" aria-hidden="true">
          <Bell />
        </div>
        <h2>Stay in the loop</h2>
        <p>Get notified when {page.title || page.name} posts something new. You can turn this off anytime.</p>
        {error && <p className="pushPromptError">{error}</p>}
        <div className="pushPromptActions">
          <button type="button" className="pushPromptAllow" onClick={allow} disabled={busy}>
            <Bell aria-hidden="true" />
            {busy ? "Enabling…" : "Allow notifications"}
          </button>
          <button type="button" className="pushPromptDismiss" onClick={dismiss} disabled={busy}>
            <BellOff aria-hidden="true" />
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
