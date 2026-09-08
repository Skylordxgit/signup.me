import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { notificationPayload, sendPushBatch, webpush } from '../lib/push';
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
  let focused = 0;
  let closed = 0;
  runInNewContext(source, {
    URL,
    self: { location: { origin }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; } },
    clients: { matchAll: async () => [{ url: origin + '/mik', focus: async () => { focused++; } }], openWindow: async (url: string) => { opened.push(url); return null; } },
  });
  async function click(url: unknown) {
    let done: Promise<unknown> | undefined;
    handlers.notificationclick({ notification: { data: { url }, close: () => { closed++; } }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
  }
  await click('https://example.com/offer?ref=push#signup');
  assert.deepEqual(opened, ['https://example.com/offer?ref=push#signup']);
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
