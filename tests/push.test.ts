import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  notificationPayload,
  sendPushBatch,
  sendPushBatchDetailed,
  validateVapidKeys,
  getVapidDiagnostic,
  isGonePushError,
  isAuthPushError,
  webpush,
} from '../lib/push';
import { isNotificationUrl } from '../lib/notificationUrl';

test('notification destinations accept HTTPS custom links and local paths', () => {
  for (const value of ['/', '/mik?offer=1#join', 'https://example.com/offer?ref=push#signup', ' https://example.com/offer ']) assert.equal(isNotificationUrl(value), true, value);
  for (const value of ['', 'example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://', 'https://user:pass@example.com', 'https://exa\nmple.com']) assert.equal(isNotificationUrl(value), false, value);
  const url = 'https://example.com/offer?ref=push#signup';
  assert.equal(JSON.parse(notificationPayload({ title: 'Offer', body: 'Open this offer', url })).url, url);
});

test('notification clicks open the custom link, focus local tabs, and reject unsafe destinations', async () => {
  const source = readFileSync('public/push-worker.js', 'utf8');
  const origin = 'https://signup888.shop';
  const handlers: Record<string, (event: unknown) => void> = {};
  const opened: string[] = [];
  const tracked: string[] = [];
  let focused = 0;
  let closed = 0;
  runInNewContext(source, {
    URL,
    self: { location: { origin }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; } },
    fetch: async (url: string, init: RequestInit) => { tracked.push(url + ':' + String(init.body)); return new Response('{}'); },
    clients: { matchAll: async () => [{ url: origin + '/mik', focus: async () => { focused++; } }], openWindow: async (url: string) => { opened.push(url); return null; } },
  });
  async function click(url: unknown, campaignId?: unknown) {
    let done: Promise<unknown> | undefined;
    handlers.notificationclick({ notification: { data: { url, campaignId }, close: () => { closed++; } }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
  }
  await click('https://example.com/offer?ref=push#signup', 42);
  assert.deepEqual(opened, ['https://example.com/offer?ref=push#signup']);
  assert.deepEqual(tracked, ['/api/notifications/campaign-click:{"campaignId":42}']);
  await click('/mik');
  assert.equal(focused, 1);
  for (const url of ['javascript:alert(1)', '//example.com', '/\\example.com', 'https://', { url: 'bad' }]) {
    await click(url);
    assert.equal(opened.at(-1), origin + '/');
  }
  assert.equal(closed, 7);
});

test('push batches bound concurrency and distinguish expired and failed subscriptions', async t => {
  let active = 0;
  let peak = 0;
  const seen = new Set<string>();
  t.mock.method(webpush, 'sendNotification', async (subscription: { endpoint: string }, payload: string, options: { TTL: number; timeout: number }) => {
    active += 1;
    peak = Math.max(peak, active);
    seen.add(subscription.endpoint);
    assert.equal(payload, 'message');
    assert.equal(options.TTL, 86400);
    assert.equal(options.timeout, 10000);
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
    if (subscription.endpoint.endsWith('/0')) throw { statusCode: 410 };
    if (subscription.endpoint.endsWith('/1')) throw { statusCode: 503 };
    return {};
  });
  const subscribers = Array.from({ length: 12 }, (_, index) => ({ endpoint: 'https://push.example/' + index, keys: { auth: 'test', p256dh: 'test' } }));
  const { result, expired } = await sendPushBatch(subscribers, 'message');
  assert.deepEqual(result, { attempted: 12, sent: 10, removed: 1, failed: 1 });
  assert.deepEqual(expired, ['https://push.example/0']);
  assert.equal(seen.size, 12);
  assert.equal(peak, 5);
  assert.deepEqual((await sendPushBatch([], 'message')).result, { attempted: 0, sent: 0, removed: 0, failed: 0 });
});

test('VAPID key validator detects valid pairs, mismatches, and malformed keys', () => {
  const generated = webpush.generateVAPIDKeys();
  const validResult = validateVapidKeys(generated.publicKey, generated.privateKey);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.keysMatch, true);
  assert.equal(validResult.error, null);

  // Mismatched keys from two different key generations
  const second = webpush.generateVAPIDKeys();
  const mismatchResult = validateVapidKeys(generated.publicKey, second.privateKey);
  assert.equal(mismatchResult.valid, false);
  assert.equal(mismatchResult.keysMatch, false);
  assert.match(mismatchResult.error || '', /do not match/);

  // Invalid base64 or corrupt key
  const invalidResult = validateVapidKeys('invalid-key', generated.privateKey);
  assert.equal(invalidResult.valid, false);
  assert.match(invalidResult.error || '', /invalid|length/i);
});

test('sendPushBatchDetailed captures status codes, separates auth errors from expired, and logs errors', async t => {
  t.mock.method(webpush, 'sendNotification', async (subscription: { endpoint: string }) => {
    if (subscription.endpoint.endsWith('/201')) {
      return { statusCode: 201 };
    }
    if (subscription.endpoint.endsWith('/403')) {
      throw { statusCode: 403, body: 'VAPID credentials do not match applicationServerKey' };
    }
    if (subscription.endpoint.endsWith('/410')) {
      throw { statusCode: 410, body: 'push subscription has unsubscribed or expired' };
    }
    if (subscription.endpoint.endsWith('/500')) {
      throw { statusCode: 500, body: 'Internal push server error' };
    }
    return { statusCode: 201 };
  });

  const recipients = [
    {
      id: 1,
      endpointHash: 'hash-ok',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/201', keys: { auth: 'a', p256dh: 'p' } },
      pageSlug: 'landing',
      details: { country: 'India', city: 'Mumbai', device: 'Mobile', browser: 'Chrome' },
    },
    {
      id: 2,
      endpointHash: 'hash-auth-mismatch',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/403', keys: { auth: 'a', p256dh: 'p' } },
      pageSlug: 'landing',
      details: { country: 'India', city: 'Delhi', device: 'Desktop', browser: 'Chrome' },
    },
    {
      id: 3,
      endpointHash: 'hash-expired',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/410', keys: { auth: 'a', p256dh: 'p' } },
      pageSlug: 'landing',
      details: { country: 'Bangladesh', city: 'Dhaka', device: 'Mobile', browser: 'Firefox' },
    },
    {
      id: 4,
      endpointHash: 'hash-server-err',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/500', keys: { auth: 'a', p256dh: 'p' } },
      pageSlug: 'landing',
      details: { country: 'Unknown', city: 'Unknown', device: 'Desktop', browser: 'Edge' },
    },
  ];

  const { result, expired, authFailed, items } = await sendPushBatchDetailed(recipients, '{"title":"Test"}');

  assert.equal(result.attempted, 4);
  assert.equal(result.sent, 1);
  assert.equal(result.removed, 1); // 410 counted as removed
  assert.equal(result.failed, 2); // 403 + 500 counted as failed

  assert.deepEqual(expired, ['hash-expired']);
  assert.deepEqual(authFailed, ['hash-auth-mismatch']);

  assert.equal(items.length, 4);

  const okItem = items.find(i => i.recipientId === 1);
  assert.equal(okItem?.status, 'sent');
  assert.equal(okItem?.statusCode, 201);
  assert.equal(okItem?.city, 'Mumbai');

  const authItem = items.find(i => i.recipientId === 2);
  assert.equal(authItem?.status, 'failed');
  assert.equal(authItem?.statusCode, 403);
  assert.match(authItem?.errorReason || '', /VAPID credentials/);

  const expiredItem = items.find(i => i.recipientId === 3);
  assert.equal(expiredItem?.status, 'expired');
  assert.equal(expiredItem?.statusCode, 410);

  const serverErrItem = items.find(i => i.recipientId === 4);
  assert.equal(serverErrItem?.status, 'failed');
  assert.equal(serverErrItem?.statusCode, 500);
});

test('push error helpers correctly classify HTTP status codes', () => {
  assert.equal(isGonePushError({ statusCode: 410 }), true);
  assert.equal(isGonePushError({ statusCode: 404 }), true);
  assert.equal(isGonePushError({ statusCode: 401 }), false);
  assert.equal(isGonePushError({ statusCode: 403 }), false);
  assert.equal(isGonePushError({ statusCode: 500 }), false);

  assert.equal(isAuthPushError({ statusCode: 401 }), true);
  assert.equal(isAuthPushError({ statusCode: 403 }), true);
  assert.equal(isAuthPushError({ statusCode: 410 }), false);
  assert.equal(isAuthPushError({ statusCode: 500 }), false);
});
