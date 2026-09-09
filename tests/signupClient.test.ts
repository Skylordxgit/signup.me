import assert from "node:assert/strict";
import test from "node:test";
import { submitSignup } from "../lib/signupClient";

const input = { email: "new@example.test", password: "test-password" };

test("signup accepts a confirmed account and sends credentials to the signup endpoint", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/auth/signup");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(options.body)), input);
    return Response.json({ ok: true, workspaceId: "new-workspace" }, { status: 201 });
  });
  await submitSignup(input);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("signup preserves actionable validation errors from the server", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "This email already has an account. Please sign in instead." }, { status: 400 }));
  await assert.rejects(submitSignup(input), /already has an account/);
});

test("signup rejects HTML challenges and proxy failures instead of treating them as success", async (t) => {
  for (const status of [200, 502]) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response("<html>Checking your browser</html>", { status }));
    await assert.rejects(submitSignup(input), /Could not confirm signup/);
    mock.mock.restore();
  }
});

test("signup turns network failures into a retryable message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(submitSignup(input), /Check your connection and try again/);
});

test("signup stops waiting after thirty seconds without automatically creating another account", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetchMock = t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  const rejected = assert.rejects(submitSignup(input), /Try signing in with this email first/);
  t.mock.timers.tick(30_000);
  await rejected;
  assert.equal(fetchMock.mock.callCount(), 1);
});
