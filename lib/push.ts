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

export { webpush };
