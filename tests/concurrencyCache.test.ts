import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheGet, cacheSet, cacheDelete, cacheGetOrSet } from '../lib/cache';
import { enqueuePageView, enqueueLinkClick, flushAnalytics } from '../lib/analyticsQueue';
import { checkRateLimit } from '../lib/rateLimit';

test('multi-tier cache gets, sets, and deletes accurately', async () => {
  await cacheSet('test:key:1', { name: 'Alpha', count: 42 }, 10);
  const fetched = await cacheGet<{ name: string; count: number }>('test:key:1');
  assert.equal(fetched?.name, 'Alpha');
  assert.equal(fetched?.count, 42);

  await cacheDelete('test:key:1');
  assert.equal(await cacheGet('test:key:1'), null);
});

test('cache stampede protection coalesces 500 concurrent requests into 1 execution', async () => {
  let executionCount = 0;
  const loader = async () => {
    executionCount++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return { data: 'snapshot-content' };
  };

  const results = await Promise.all(
    Array.from({ length: 500 }).map(() =>
      cacheGetOrSet('stampede:test:500', loader, 60)
    )
  );

  assert.equal(executionCount, 1);
  assert.equal(results.length, 500);
  assert.equal(results[0].data, 'snapshot-content');
  assert.equal(results[499].data, 'snapshot-content');
  await cacheDelete('stampede:test:500');
});

test('rate limiter enforces sliding window and returns remaining counts', async () => {
  const key = 'test-ip-' + Date.now();
  const first = await checkRateLimit(key, 5, 60);
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 4);

  for (let i = 0; i < 4; i++) {
    await checkRateLimit(key, 5, 60);
  }

  const blocked = await checkRateLimit(key, 5, 60);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetInSeconds > 0);
});

test('analytics queue buffers high-concurrency views and flushes in batches without errors', async () => {
  for (let i = 0; i < 50; i++) {
    enqueuePageView({
      pageId: 1,
      visitorHash: `hash-${i}`,
      deviceType: 'mobile',
      referrer: 'https://google.com',
      country: 'US',
      city: 'New York',
      workspaceId: 'default',
    });
    enqueueLinkClick({
      pageId: 1,
      blockId: 2,
      deviceType: 'mobile',
      referrer: 'https://google.com',
      country: 'US',
      city: 'New York',
      workspaceId: 'default',
    });
  }

  // Flush without MySQL configured should gracefully handle without throwing
  await flushAnalytics();
});
