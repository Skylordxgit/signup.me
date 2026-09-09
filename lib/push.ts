import webpush from "web-push";
import type { NotificationSendInput, PushSubscriptionRecord } from "./types";

const contact = process.env.WEB_PUSH_CONTACT || "mailto:admin@signup888.shop";

export function webPushPublicKey() {
  return process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || "";
}

function webPushPrivateKey() {
  return process.env.WEB_PUSH_PRIVATE_KEY || "";
}

export function webPushConfigured() {
  return Boolean(webPushPublicKey() && webPushPrivateKey());
}

export function configureWebPush() {
  const publicKey = webPushPublicKey();
  const privateKey = webPushPrivateKey();
  if (!publicKey || !privateKey) throw new Error("Browser notifications are not configured yet.");
  webpush.setVapidDetails(contact, publicKey, privateKey);
}

export function isPushSubscription(value: unknown): value is PushSubscriptionRecord {
  if (!value || typeof value !== "object") return false;
  const subscription = value as PushSubscriptionRecord;
  return Boolean(
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    subscription.keys &&
    typeof subscription.keys.p256dh === "string" &&
    typeof subscription.keys.auth === "string",
  );
}

export function notificationPayload(input: NotificationSendInput) {
  return JSON.stringify({
    title: input.title.trim(),
    body: input.body.trim(),
    url: input.url.trim() || "/",
    campaignId: 'campaignId' in input && typeof input.campaignId === 'number' ? input.campaignId : undefined,
    icon: "/favicon.png",
    badge: "/favicon-32x32.png",
  });
}

export function isGonePushError(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushBatch(subscriptions: PushSubscriptionRecord[], payload: string) {
  const result = { attempted: subscriptions.length, sent: 0, removed: 0, failed: 0 };
  const expired: string[] = [];
  let next = 0;
  // Bound concurrent network requests so one slow endpoint cannot block everyone.
  await Promise.all(Array.from({ length: Math.min(5, subscriptions.length) }, async () => {
    while (next < subscriptions.length) {
      const subscription = subscriptions[next++];
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 86400, urgency: 'normal', timeout: 10000 });
        result.sent += 1;
      } catch (error) {
        if (isGonePushError(error)) {
          expired.push(subscription.endpoint);
          // Kept for API compatibility: "removed" means inactive/expired, not deleted.
          result.removed += 1;
        } else result.failed += 1;
      }
    }
  }));
  return { result, expired };
}

export { webpush };
