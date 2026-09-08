import webpush from "web-push";
import type { PushCampaign } from "./types";
import {
  addPushSubscription,
  countPushSubscriptions,
  getVapidKeys,
  listCampaigns,
  listPushSubscriptions,
  recordCampaign,
  removePushSubscriptionByEndpoint,
  setVapidKeys,
} from "./store";

let configuredWith: string | null = null;

/**
 * VAPID keys identify this server to the browser push services. They must
 * stay stable across restarts or every existing subscription breaks, so the
 * pair is generated once and persisted through the store (JSON file or the
 * MySQL settings table) rather than recreated on boot.
 */
export async function ensureVapidKeys() {
  let keys = await getVapidKeys();
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    keys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
    await setVapidKeys(keys);
  }
  if (configuredWith !== keys.publicKey) {
    webpush.setVapidDetails("mailto:notifications@smartlink.local", keys.publicKey, keys.privateKey);
    configuredWith = keys.publicKey;
  }
  return keys;
}

export async function getPublicVapidKey() {
  return (await ensureVapidKeys()).publicKey;
}

export async function subscribe(
  pageId: number,
  subscription: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
  userAgent: string,
) {
  if (
    typeof subscription.endpoint !== "string"
    || !subscription.endpoint
    || typeof subscription.keys?.p256dh !== "string"
    || typeof subscription.keys?.auth !== "string"
  ) {
    throw new Error("Invalid subscription");
  }
  await ensureVapidKeys();
  await addPushSubscription(
    pageId,
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
    userAgent.slice(0, 255),
  );
}

export async function subscriberCount(pageId: number) {
  return countPushSubscriptions(pageId);
}

export async function campaignsForPage(pageId: number) {
  return listCampaigns(pageId);
}

/**
 * Pushes one campaign to every subscriber of a page. A subscription that the
 * push service reports as gone (410) or unknown (404) is removed so future
 * sends don't keep retrying a dead endpoint.
 */
export async function sendCampaign(
  pageId: number,
  input: { title: string; body: string; url?: string },
): Promise<PushCampaign> {
  await ensureVapidKeys();

  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 500);
  if (!title) throw new Error("Title is required");
  if (!body) throw new Error("Message is required");

  const url = (input.url || "").trim().slice(0, 700);
  const subscriptions = await listPushSubscriptions(pageId);
  const payload = JSON.stringify({ title, body, url });

  let sentCount = 0;
  let failedCount = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        );
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscriptionByEndpoint(subscription.endpoint);
        }
      }
    }),
  );

  return recordCampaign(pageId, { title, body, url, sentCount, failedCount });
}
