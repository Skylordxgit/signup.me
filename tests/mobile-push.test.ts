import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import { pushSupport } from '../lib/pushSupport';
import { collectSubscriberDetails, subscriberListItem } from '../lib/subscriberDetails';
import { mysqlPool } from '../lib/mysql';
import * as mysqlStore from '../lib/stores/mysqlStore';
import * as jsonStore from '../lib/stores/jsonStore';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const base = { userAgent: iphone, touchPoints: 5, standalone: false, secure: true, hasPush: false, permission: 'default' };

test('iPhone/iPad distinguishes installation, old OS, allowed and denied permissions', () => {
  assert.equal(pushSupport(base), 'ios-install');
  assert.equal(pushSupport({ ...base, standalone: true, hasPush: true }), 'supported');
  assert.equal(pushSupport({ ...base, standalone: true, hasPush: true, permission: 'denied' }), 'blocked');
  assert.equal(pushSupport({ ...base, userAgent: iphone.replace('17_4', '16_3') }), 'ios-update');
  assert.equal(pushSupport({ ...base, userAgent: iphone.replace('17_4', '16_4') }), 'ios-install');
  assert.equal(pushSupport({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17.0 Safari/605.1.15' }), 'ios-install');
  assert.equal(pushSupport({ ...base, secure: false }), 'insecure');
});

test('Android and desktop support depends on available APIs, not OS allowlists', () => {
  for (const userAgent of ['Android 8.0 Chrome/100', 'Android 15 SamsungBrowser/26', 'Windows Firefox/140', 'Linux Chrome/130']) {
    assert.equal(pushSupport({ ...base, userAgent, hasPush: true }), 'supported');
    assert.equal(pushSupport({ ...base, userAgent, hasPush: false }), 'unsupported');
  }
});

test('subscriber metadata ignores untrusted IP headers and never exposes push secrets', t => {
  for (const key of ['SUBSCRIBER_IP_HEADER', 'SUBSCRIBER_COUNTRY_HEADER', 'SUBSCRIBER_CITY_HEADER']) {
    const original = process.env[key];
    delete process.env[key];
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  }
  const headers = new Headers({ 'user-agent': iphone, 'x-forwarded-for': '198.51.100.8', 'x-visitor-ip': '2001:db8::1', 'x-visitor-country': 'BD' });
  const unknown = collectSubscriberDetails(headers, { timezone: 'not-a-timezone', ipAddress: 'forged' });
  assert.equal(unknown.ipAddress, '');
  assert.equal(unknown.timezone, '');
  assert.equal(unknown.device, 'iPhone');
  assert.equal(unknown.browser, 'Safari');
  process.env.SUBSCRIBER_IP_HEADER = 'x-visitor-ip';
  process.env.SUBSCRIBER_COUNTRY_HEADER = 'x-visitor-country';
  const details = collectSubscriberDetails(headers, { timezone: 'Asia/Dhaka' });
  assert.equal(details.ipAddress, '2001:db8::1');
  assert.equal(details.country, 'BD');
  assert.equal(details.city, '');
  assert.equal(details.timezone, 'Asia/Dhaka');
  headers.set('x-visitor-ip', '198.51.100.8, 10.0.0.1');
  assert.equal(collectSubscriberDetails(headers, {}).ipAddress, '');
  const item = { id: 1, pageId: 1, slug: 'example', userAgent: 'Android SamsungBrowser/22', createdAt: '2026-09-08', endpointHash: 'secret', subscription: { keys: { auth: 'secret' } } };
  const publicItem = subscriberListItem(item);
  assert.equal(publicItem.device, 'Android');
  assert.equal(publicItem.browser, 'Samsung Internet');
  assert.equal(publicItem.ipAddress, '');
  assert.ok(!JSON.stringify(publicItem).includes('secret'));
});

test('MySQL automatically migrates existing subscriber table and saves details', async t => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
  t.after(() => { if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original; });
  let upgrades = 0;
  let stored: string | null = null;
  const pool = mysqlPool();
  const row = () => ({ id: 1, page_id: 1, slug: 'example', endpoint_hash: 'secret', subscription_json: { endpoint: 'https://push.example/key', keys: { auth: 'secret', p256dh: 'secret' } }, user_agent: iphone, client_details: stored, created_at: new Date(), updated_at: new Date() });
  t.mock.method(pool, 'query', async () => [[], []]);
  t.mock.method(pool, 'execute', async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith('SHOW COLUMNS')) return [[], []];
    if (sql.startsWith('ALTER TABLE')) { upgrades++; return [[], []]; }
    if (sql.startsWith('SELECT id FROM pages')) return [[{ id: 1 }], []];
    if (sql.startsWith('INSERT INTO push_subscriptions')) { stored = values[4] as string; return [[], []]; }
    if (sql.includes('COUNT(*) AS subscribers')) return [[{ page_id: 1, slug: 'example', subscribers: 1 }], []];
    return [sql.startsWith('SELECT') ? [row()] : [], []];
  });
  const details = { device: 'iPhone', browser: 'Safari', ipAddress: '198.51.100.8', country: 'BD', city: '', timezone: 'Asia/Dhaka' };
  await mysqlStore.savePushSubscription('example', row().subscription_json, iphone, details);
  const summary = await mysqlStore.listPushSubscribers();
  assert.equal(upgrades, 3);
  assert.equal(summary.total, 1);
  assert.equal(summary.inactive, 0);
  assert.equal(summary.recent?.[0].ipAddress, details.ipAddress);
  assert.ok(!JSON.stringify(summary).includes('secret'));
});

test('JSON subscribers preserve older records and persist details for new subscriptions', async t => {
  let database = JSON.stringify({ pages: [{ id: 1, slug: 'example', status: 'published' }], pushSubscriptions: [{ id: 1, pageId: 1, slug: 'example', endpointHash: 'old', userAgent: 'Android Chrome/120', createdAt: '2026-09-01', updatedAt: '2026-09-01', subscription: { endpoint: 'https://push.example/old', keys: { auth: 'secret' } } }] });
  t.mock.method(fs, 'readFile', async () => database);
  t.mock.method(fs, 'mkdir', async () => undefined);
  t.mock.method(fs, 'writeFile', async (_path: unknown, text: string) => { database = text; });
  const details = { device: 'iPhone', browser: 'Safari', ipAddress: '198.51.100.9', country: '', city: '', timezone: '' };
  await jsonStore.savePushSubscription('example', { endpoint: 'https://push.example/new', keys: { auth: 'secret', p256dh: 'secret' } }, iphone, details);
  const summary = await jsonStore.listPushSubscribers();
  assert.equal(summary.total, 2);
  assert.equal(summary.inactive, 0);
  assert.equal(summary.recent?.[0].ipAddress, '198.51.100.9');
  assert.equal(summary.recent?.[1].device, 'Android');
  assert.equal(summary.recent?.[1].ipAddress, '');
  assert.ok(!JSON.stringify(summary).includes('secret'));
});
