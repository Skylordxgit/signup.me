import crypto from "node:crypto";
import webpush from "web-push";
import type {
  NotificationSendInput,
  PushDeliveryItemResult,
  PushRecipient,
  PushSubscriptionRecord,
} from "./types";

const contact = process.env.WEB_PUSH_CONTACT || "mailto:admin@signup888.shop";

export function webPushPublicKey() {
  return process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || "";
}

export function webPushPrivateKey() {
  return process.env.WEB_PUSH_PRIVATE_KEY || "";
}

export function webPushConfigured() {
  return Boolean(webPushPublicKey() && webPushPrivateKey());
}

export function decodeBase64Url(value: string): Buffer {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function validateVapidKeys(
  publicKey?: string,
  privateKey?: string
): {
  valid: boolean;
  error: string | null;
  keyPairMatches?: boolean;
  keysMatch?: boolean;
} {
  const pub = (publicKey ?? webPushPublicKey()).trim();
  const priv = (privateKey ?? webPushPrivateKey()).trim();
  if (!pub) return { valid: false, error: "Public VAPID key is missing", keyPairMatches: false, keysMatch: false };
  if (!priv) return { valid: false, error: "Private VAPID key is missing", keyPairMatches: false, keysMatch: false };

  try {
    const pubBuf = decodeBase64Url(pub);
    const privBuf = decodeBase64Url(priv);

    if (privBuf.length !== 32) {
      return { valid: false, error: `Invalid private key length: expected 32 bytes, got ${privBuf.length} bytes`, keyPairMatches: false, keysMatch: false };
    }
    if (pubBuf.length !== 65) {
      return { valid: false, error: `Invalid public key length: expected 65 bytes, got ${pubBuf.length} bytes`, keyPairMatches: false, keysMatch: false };
    }

    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privBuf);
    const derivedPub = ecdh.getPublicKey();

    const matches = pubBuf.equals(derivedPub);
    if (!matches) {
      return {
        valid: false,
        keyPairMatches: false,
        keysMatch: false,
        error: "VAPID public and private keys do not match (they do not belong to the same ECDH key pair)",
      };
    }

    return { valid: true, keyPairMatches: true, keysMatch: true, error: null };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "VAPID key parsing failed", keyPairMatches: false, keysMatch: false };
  }
}

export function getVapidDiagnostic() {
  const pub = webPushPublicKey();
  const nextPub = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "";
  const priv = webPushPrivateKey();
  const validation = validateVapidKeys(pub, priv);

  return {
    contact,
    publicKeyConfigured: Boolean(pub),
    nextPublicKeyConfigured: Boolean(nextPub),
    privateKeyConfigured: Boolean(priv),
    publicKeyPrefix: pub ? `${pub.slice(0, 10)}...${pub.slice(-6)}` : "",
    nextPublicMatchesServer: !nextPub || nextPub === pub,
    valid: validation.valid,
    keyPairMatches: validation.keyPairMatches ?? false,
    keysMatch: validation.keyPairMatches ?? false,
    error: validation.error ?? null,
  };
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
      subscription.keys.p256dh.trim().length > 0 &&
      typeof subscription.keys.auth === "string" &&
      subscription.keys.auth.trim().length > 0
  );
}

export function notificationPayload(input: NotificationSendInput) {
  return JSON.stringify({
    title: input.title.trim(),
    body: input.body.trim(),
    url: input.url.trim() || "/",
    campaignId: "campaignId" in input && typeof input.campaignId === "number" ? input.campaignId : undefined,
    image: input.image || undefined,
    icon: input.icon || "/favicon.png",
    badge: input.badge || "/favicon-32x32.png",
    actions: input.ctaText ? [{ action: "open", title: input.ctaText }] : undefined,
    priority: input.priority || "normal",
  });
}

export function isGonePushError(error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return statusCode === 404 || statusCode === 410;
}

export function isAuthPushError(error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return statusCode === 401 || statusCode === 403;
}

export async function sendPushBatchDetailed(
  recipients: PushRecipient[],
  payload: string,
  options?: {
    concurrency?: number;
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    priority?: "normal" | "high" | "urgent";
  }
) {
  const summary = { attempted: recipients.length, sent: 0, removed: 0, failed: 0 };
  const expiredHashes: string[] = [];
  const authFailedHashes: string[] = [];
  const items: PushDeliveryItemResult[] = [];
  const concurrency = Math.max(1, Math.min(20, options?.concurrency ?? 10));
  const urgency = options?.urgency || (options?.priority === "urgent" ? "high" : options?.priority) || "normal";

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, recipients.length) }, async () => {
      while (next < recipients.length) {
        const recipient = recipients[next++];
        const details = recipient.details || {};
        const country = details.country || details.countryName || "Unknown";
        const region = details.region || details.regionName || "";
        const city = details.city || "Unknown";
        const device = details.device || "Desktop";
        const browser = details.browser || "Browser";

        try {
          const response = await webpush.sendNotification(recipient.subscription, payload, {
            TTL: options?.TTL ?? 86400,
            urgency,
            timeout: 10000,
          });
          const statusCode =
            response && typeof response === "object" && "statusCode" in response
              ? Number((response as { statusCode?: unknown }).statusCode)
              : 201;

          summary.sent += 1;
          items.push({
            recipientId: recipient.id,
            endpoint: recipient.subscription.endpoint,
            endpointHash: recipient.endpointHash,
            status: "sent",
            statusCode,
            pageSlug: recipient.pageSlug,
            country,
            region,
            city,
            device,
            browser,
          });
        } catch (error: unknown) {
          const errObj = error as { statusCode?: unknown; body?: unknown; message?: string };
          const statusCode = Number(errObj?.statusCode || 0);
          const rawBody = typeof errObj?.body === "string" ? errObj.body : errObj?.message || "Push delivery failed";
          const trimmedBody = rawBody.replace(/[\r\n\t]+/g, " ").slice(0, 200);

          if (isGonePushError(error)) {
            // 404 Not Found or 410 Gone (Subscription expired / unregistered)
            expiredHashes.push(recipient.endpointHash);
            summary.removed += 1;
            items.push({
              recipientId: recipient.id,
              endpoint: recipient.subscription.endpoint,
              endpointHash: recipient.endpointHash,
              status: "expired",
              statusCode: statusCode || 410,
              errorReason: `${statusCode || 410} Subscription expired / unregistered: ${trimmedBody}`,
              pageSlug: recipient.pageSlug,
              country,
              region,
              city,
              device,
              browser,
            });
          } else if (isAuthPushError(error)) {
            // 401 Unauthorized or 403 Forbidden (VAPID key mismatch)
            authFailedHashes.push(recipient.endpointHash);
            summary.failed += 1;
            items.push({
              recipientId: recipient.id,
              endpoint: recipient.subscription.endpoint,
              endpointHash: recipient.endpointHash,
              status: "failed",
              statusCode: statusCode || 403,
              errorReason: `${statusCode || 403} VAPID authentication failed: ${trimmedBody}`,
              pageSlug: recipient.pageSlug,
              country,
              region,
              city,
              device,
              browser,
            });
          } else {
            // Transient, 429 rate limit, 5xx server error, or network error
            summary.failed += 1;
            items.push({
              recipientId: recipient.id,
              endpoint: recipient.subscription.endpoint,
              endpointHash: recipient.endpointHash,
              status: "failed",
              statusCode: statusCode || 500,
              errorReason: `${statusCode || "Error"}: ${trimmedBody}`,
              pageSlug: recipient.pageSlug,
              country,
              region,
              city,
              device,
              browser,
            });
          }
        }
      }
    })
  );

  return { result: summary, expired: expiredHashes, authFailed: authFailedHashes, items };
}

export async function sendPushBatch(subscriptions: PushSubscriptionRecord[], payload: string) {
  const result = { attempted: subscriptions.length, sent: 0, removed: 0, failed: 0 };
  const expired: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, subscriptions.length) }, async () => {
      while (next < subscriptions.length) {
        const subscription = subscriptions[next++];
        try {
          await webpush.sendNotification(subscription, payload, { TTL: 86400, urgency: "normal", timeout: 10000 });
          result.sent += 1;
        } catch (error) {
          if (isGonePushError(error)) {
            expired.push(subscription.endpoint);
            result.removed += 1;
          } else {
            result.failed += 1;
          }
        }
      }
    })
  );
  return { result, expired };
}

export { webpush };
