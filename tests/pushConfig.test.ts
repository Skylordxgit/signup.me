import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import webpush from "web-push";
import { NextRequest } from "next/server";
import { withSession } from "./requestContext";
import { createSessionToken } from "../lib/auth";
import { encryptSecret, decryptSecret, computeKeyFingerprint, computeSecretHash } from "../lib/encryption";
import {
  scanEnvPushConfig,
  compareEnvVsDb,
  getActiveWebPushConfig,
  getRuntimePushPublicConfig,
  invalidatePushConfigCache,
  savePushConfig,
  syncEnvToDb,
} from "../lib/pushConfig";
import { getSystemPushConfig, savePushSubscription, getSystemPushAuditLogs } from "../lib/store";
import type { RuntimePushPublicConfig } from "../lib/types";
import * as publicPushConfigRoute from "../app/api/public/push-config/route";
import * as masterPushConfigRoute from "../app/api/master/push-config/route";
import * as masterPushSyncRoute from "../app/api/master/push-config/sync/route";

async function isolated(run: () => Promise<void>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "push-config-test-"));
  process.chdir(directory);
  invalidatePushConfigCache();
  try {
    await run();
  } finally {
    invalidatePushConfigCache();
    process.chdir(previous);
    await rm(directory, { recursive: true, force: true });
  }
}

test("encryption module encrypts and decrypts secrets with AES-256-GCM and resists tampering", () => {
  const secret = "test-private-key-1234567890-abcdef";
  const encrypted = encryptSecret(secret);

  assert.notEqual(encrypted, secret);
  assert.equal(encrypted.split(":").length, 3); // iv:tag:ciphertext

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret);

  // Tampered ciphertext fails
  const parts = encrypted.split(":");
  const tampered = `${parts[0]}:${parts[1]}:badciphertext`;
  assert.throws(() => decryptSecret(tampered));

  // Tampered auth tag fails
  const tamperedTag = `${parts[0]}:00000000000000000000000000000000:${parts[2]}`;
  assert.throws(() => decryptSecret(tamperedTag));
});

test("encryption module computes deterministic fingerprints and hashes", () => {
  const sample = "BOg66778899aabbcc";
  const fp1 = computeKeyFingerprint(sample);
  const fp2 = computeKeyFingerprint(sample);
  assert.equal(fp1, fp2);
  assert.equal(fp1.split(":").length, 8);

  const hash1 = computeSecretHash("my-secret");
  const hash2 = computeSecretHash("my-secret");
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
});

test("scanEnvPushConfig accurately parses and validates environment keys", () => {
  const keys = webpush.generateVAPIDKeys();
  const scan = scanEnvPushConfig({
    WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_SUBJECT: "mailto:admin@example.com",
  });

  assert.equal(scan.publicKeyConfigured, true);
  assert.equal(scan.privateKeyConfigured, true);
  assert.equal(scan.pairValid, true);
  assert.equal(scan.nextPublicKeyMatches, true);
  assert.equal(scan.subject, "mailto:admin@example.com");

  // Scan with mismatched NEXT_PUBLIC key
  const scanMismatch = scanEnvPushConfig({
    WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: "different-public-key",
    WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_SUBJECT: "mailto:admin@example.com",
  });
  assert.equal(scanMismatch.nextPublicKeyMatches, false);
});

test("compareEnvVsDb detects drift between environment and database", async () => {
  await isolated(async () => {
    const keys = webpush.generateVAPIDKeys();
    const env = {
      WEB_PUSH_PUBLIC_KEY: keys.publicKey,
      WEB_PUSH_PRIVATE_KEY: keys.privateKey,
      WEB_PUSH_SUBJECT: "mailto:env@example.com",
    };

    // When DB is empty
    const comp1 = await compareEnvVsDb(env);
    assert.equal(comp1.overallStatus, "not_in_db");
    assert.equal(comp1.publicKeyMatch, false);

    // Save matching keys to DB
    await savePushConfig({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:env@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
    });

    const comp2 = await compareEnvVsDb(env);
    assert.equal(comp2.publicKeyMatch, true);
    assert.equal(comp2.subjectMatch, true);
    assert.equal(comp2.overallStatus, "synced");
  });
});

test("getActiveWebPushConfig respects resolver priority (DB Active > ENV Fallback > None)", async () => {
  await isolated(async () => {
    const keysEnv = webpush.generateVAPIDKeys();
    const keysDb = webpush.generateVAPIDKeys();

    const env = {
      WEB_PUSH_PUBLIC_KEY: keysEnv.publicKey,
      WEB_PUSH_PRIVATE_KEY: keysEnv.privateKey,
      WEB_PUSH_SUBJECT: "mailto:env@example.com",
    };

    // Step 1: No DB config -> falls back to ENV
    let resolved = await getActiveWebPushConfig(env);
    assert.equal(resolved?.source, "env");
    assert.equal(resolved?.publicKey, keysEnv.publicKey);
    assert.equal(resolved?.subject, "mailto:env@example.com");

    // Step 2: Save active DB config -> takes priority over ENV
    await savePushConfig({
      publicKey: keysDb.publicKey,
      privateKey: keysDb.privateKey,
      subject: "mailto:db@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
    });

    resolved = await getActiveWebPushConfig(env);
    assert.equal(resolved?.source, "database");
    assert.equal(resolved?.publicKey, keysDb.publicKey);
    assert.equal(resolved?.subject, "mailto:db@example.com");

    // Step 3: Deactivate DB config -> falls back to ENV again
    await savePushConfig({
      publicKey: keysDb.publicKey,
      subject: "mailto:db@example.com",
      enabled: false,
      actorEmail: "admin@example.com",
    });

    resolved = await getActiveWebPushConfig(env);
    assert.equal(resolved?.source, "env");
    assert.equal(resolved?.publicKey, keysEnv.publicKey);
  });
});

test("key rotation detection warns when subscribers exist and requires confirmation", async () => {
  await isolated(async () => {
    const keys1 = webpush.generateVAPIDKeys();
    const keys2 = webpush.generateVAPIDKeys();

    // Save initial key
    await savePushConfig({
      publicKey: keys1.publicKey,
      privateKey: keys1.privateKey,
      subject: "mailto:v1@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
    });

    // Add a subscriber to seed page "dr-moiz-khakiani"
    await savePushSubscription(
      "dr-moiz-khakiani",
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/sub-12345",
        keys: { auth: "auth123", p256dh: "p256dh123" },
      },
      "TestBrowser/1.0",
      undefined,
      undefined,
      {
        configVersion: 1,
        fingerprint: computeKeyFingerprint(keys1.publicKey),
      }
    );

    // Attempt to rotate to keys2 without confirmation -> should fail with rotation_required
    const attempt = await savePushConfig({
      publicKey: keys2.publicKey,
      privateKey: keys2.privateKey,
      subject: "mailto:v2@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
      rotateConfirmed: false,
    });

    assert.equal(attempt.success, false);
    assert.equal(attempt.warning, "rotation_required");
    assert.equal(attempt.subscriberCount, 1);

    // Verify key in DB was NOT changed
    const current = await getSystemPushConfig();
    assert.equal(current?.publicKey, keys1.publicKey);

    // Confirm rotation -> should succeed
    const confirmed = await savePushConfig({
      publicKey: keys2.publicKey,
      privateKey: keys2.privateKey,
      subject: "mailto:v2@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
      rotateConfirmed: true,
    });

    assert.equal(confirmed.success, true);
    const updated = await getSystemPushConfig();
    assert.equal(updated?.publicKey, keys2.publicKey);
    assert.equal(updated?.configVersion, 2);

    // Verify audit log captured key_rotation
    const logs = await getSystemPushAuditLogs();
    assert.ok(logs.some((l) => l.action === "key_rotation"));
  });
});

test("1-Click syncEnvToDb safely writes active config from environment", async () => {
  await isolated(async () => {
    const keys = webpush.generateVAPIDKeys();
    const env = {
      WEB_PUSH_PUBLIC_KEY: keys.publicKey,
      WEB_PUSH_PRIVATE_KEY: keys.privateKey,
      WEB_PUSH_SUBJECT: "mailto:hostinger@example.com",
    };

    const res = await syncEnvToDb("master@example.com", env);
    assert.equal(res.success, true);
    assert.equal(res.config?.publicKey, keys.publicKey);
    assert.equal(res.config?.subject, "mailto:hostinger@example.com");
    assert.equal(res.config?.enabled, true);

    const dbConfig = await getSystemPushConfig();
    assert.equal(dbConfig?.publicKey, keys.publicKey);
    assert.ok(dbConfig?.privateKeyEncrypted);

    const logs = await getSystemPushAuditLogs();
    assert.ok(logs.some((l) => l.action === "env_sync"));
  });
});

test("public safe endpoint GET /api/public/push-config never exposes secrets", async () => {
  await isolated(async () => {
    const keys = webpush.generateVAPIDKeys();
    await savePushConfig({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:public@example.com",
      enabled: true,
      actorEmail: "admin@example.com",
    });

    const response = await publicPushConfigRoute.GET();
    assert.equal(response.status, 200);

    const data = (await response.json()) as RuntimePushPublicConfig;
    assert.equal(data.enabled, true);
    assert.equal(data.publicKey, keys.publicKey);
    assert.equal(typeof data.configVersion, "number");
    assert.equal(typeof data.fingerprint, "string");

    // Critical assertion: NO private key or encrypted secret present in payload
    assert.equal((data as Record<string, unknown>).privateKey, undefined);
    assert.equal((data as Record<string, unknown>).encryptedPrivateKey, undefined);
  });
});

test("master admin push routes reject workspace admin sessions", async () => {
  await isolated(async () => {
    // Normal workspace admin session (scope: "workspace")
    const workspaceAdminToken = createSessionToken({
      accountId: "acc_user123",
      email: "user@example.com",
      role: "owner",
      workspaceId: "ws_default",
      scope: "workspace",
    });

    await withSession(workspaceAdminToken, async () => {
      const getRes = await masterPushConfigRoute.GET();
      assert.equal(getRes.status, 401);

      const postRes = await masterPushSyncRoute.POST();
      assert.equal(postRes.status, 401);
    });
  });
});
