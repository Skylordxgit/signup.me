import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPushBatch, webpush } from '../lib/push';

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
