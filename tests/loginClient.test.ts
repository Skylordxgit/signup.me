import assert from 'node:assert/strict';
import test from 'node:test';
import { submitLogin } from '../lib/loginClient';

const input = { email: 'owner@example.test', password: 'test-password' };

test('login confirms success and limits navigation to known destinations', async (t) => {
  for (const redirect of ['/admin/master', '/admin', 'https://example.test']) {
    const mock = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
      assert.equal(url, '/api/auth/login');
      assert.equal(options?.credentials, 'same-origin');
      assert.deepEqual(JSON.parse(String(options?.body)), input);
      return Response.json({ ok: true, redirect });
    });
    assert.equal((await submitLogin(input)).redirect, redirect === '/admin/master' ? redirect : '/admin/dashboard');
    mock.mock.restore();
  }
});

test('login rejects HTML, invalid JSON, and unconfirmed success', async (t) => {
  for (const response of [new Response('<html>Proxy error</html>', { status: 502 }), new Response('<html>Challenge</html>'), Response.json({}), Response.json(null)]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(submitLogin(input), /confirm sign in|Sign in failed/);
    mock.mock.restore();
  }
});

test('login preserves credential and rate limit errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Too many login attempts. Try again later.' }, { status: 429 }));
  await assert.rejects(submitLogin(input), /Too many login attempts/);
});

test('login recovers from connection failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(submitLogin(input), /Check your connection/);
});

test('login times out without retrying credentials automatically', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mock = t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const result = assert.rejects(submitLogin(input), /Sign in took too long/);
  t.mock.timers.tick(30_000);
  await result;
  assert.equal(mock.mock.callCount(), 1);
});
