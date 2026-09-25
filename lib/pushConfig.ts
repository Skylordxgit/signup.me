import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import {
  getSystemPushConfig,
  saveSystemPushConfig,
  updateSystemPushConfigTestStatus,
  getSystemPushAuditLogs,
  addSystemPushAuditLog,
  saveSystemTestDevice,
  getSystemTestDevice,
  listPushSubscribers,
} from "./store";
import {
  encryptSecret,
  decryptSecret,
  computeKeyFingerprint,
  computeSecretHash,
} from "./encryption";
import { validateVapidKeys, notificationPayload, isGonePushError, isAuthPushError } from "./push";
import type {
  ActiveWebPushResolvedConfig,
  EnvDbComparison,
  EnvPushScanResult,
  PushSubscriptionRecord,
  RuntimePushPublicConfig,
  SystemPushAuditLog,
  SystemPushConfigSafe,
  WebPushHealthStatus,
} from "./types";

// In-memory cache for active resolved push configuration
let cachedConfig: ActiveWebPushResolvedConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache TTL

export function invalidatePushConfigCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

/**
 * Single server resolver for active Web Push credentials.
 * Priority:
 * 1. Active Database Configuration (decrypted)
 * 2. Hostinger / Server Environment Fallback
 * 3. None (disabled)
 */
export async function getActiveWebPushConfig(envOverride?: Record<string, string | undefined>): Promise<ActiveWebPushResolvedConfig | null> {
  const now = Date.now();
  if (!envOverride && cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  // 1. Try Database Configuration
  try {
    const dbConfig = await getSystemPushConfig();
    if (dbConfig && dbConfig.enabled && dbConfig.publicKey && dbConfig.privateKeyEncrypted) {
      const decryptedPriv = decryptSecret(dbConfig.privateKeyEncrypted);
      if (decryptedPriv) {
        const resolved: ActiveWebPushResolvedConfig = {
          publicKey: dbConfig.publicKey.trim(),
          privateKey: decryptedPriv.trim(),
          subject: dbConfig.subject?.trim() || "mailto:admin@signup888.shop",
          configVersion: dbConfig.configVersion || 1,
          fingerprint: dbConfig.publicKeyFingerprint || computeKeyFingerprint(dbConfig.publicKey),
          source: "database",
          enabled: true,
        };
        if (!envOverride) {
          cachedConfig = resolved;
          cacheExpiresAt = now + CACHE_TTL_MS;
        }
        return resolved;
      }
    }
  } catch (err) {
    console.error("[PushConfig] Error resolving DB push configuration:", err);
  }

  // 2. Fallback to Hostinger / Server Environment Variables
  const env = envOverride || process.env;
  const envPub = (
    env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ||
    env.WEB_PUSH_PUBLIC_KEY ||
    ""
  ).trim();
  const envPriv = (env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const envSubject = (
    env.WEB_PUSH_SUBJECT ||
    env.WEB_PUSH_CONTACT ||
    "mailto:admin@signup888.shop"
  ).trim();

  if (envPub && envPriv) {
    const resolved: ActiveWebPushResolvedConfig = {
      publicKey: envPub,
      privateKey: envPriv,
      subject: envSubject,
      configVersion: 1,
      fingerprint: computeKeyFingerprint(envPub),
      source: "env",
      enabled: true,
    };
    if (!envOverride) {
      cachedConfig = resolved;
      cacheExpiresAt = now + CACHE_TTL_MS;
    }
    return resolved;
  }

  // 3. No active configuration
  if (!envOverride) {
    cachedConfig = null;
    cacheExpiresAt = now + 5000;
  }
  return null;
}

/**
 * Returns safe public push configuration for browsers and subscription dialogs.
 * Strictly NEVER reveals private key or encryption secrets.
 */
export async function getRuntimePushPublicConfig(): Promise<RuntimePushPublicConfig> {
  const active = await getActiveWebPushConfig();
  if (active && active.enabled && active.publicKey) {
    return {
      enabled: true,
      publicKey: active.publicKey,
      configVersion: active.configVersion,
      fingerprint: active.fingerprint,
    };
  }
  return {
    enabled: false,
    publicKey: "",
    configVersion: 0,
    fingerprint: "",
  };
}

/**
 * Configure web-push library using active runtime configuration.
 */
export async function configureWebPushFromActive(): Promise<boolean> {
  const active = await getActiveWebPushConfig();
  if (!active || !active.publicKey || !active.privateKey) {
    return false;
  }
  webpush.setVapidDetails(active.subject, active.publicKey, active.privateKey);
  return true;
}

/**
 * Safely inspect Hostinger / Server environment variables without exposing private key values.
 */
export function scanEnvPushConfig(envOverride?: Record<string, string | undefined>): EnvPushScanResult {
  const env = envOverride || process.env;
  const pub = (env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const nextPub = (env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "").trim();
  const priv = (env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const subject = (env.WEB_PUSH_SUBJECT || env.WEB_PUSH_CONTACT || "").trim();

  const publicKeyConfigured = Boolean(pub);
  const privateKeyConfigured = Boolean(priv);
  const nextPublicKeyConfigured = Boolean(nextPub);
  const nextPublicKeyMatches = Boolean(pub && nextPub && pub === nextPub);
  const subjectConfigured = Boolean(subject);

  const validation = validateVapidKeys(pub || nextPub, priv);

  return {
    publicKeyConfigured,
    publicKeyPreview: pub ? `${pub.slice(0, 10)}...${pub.slice(-6)}` : undefined,
    publicKeyFingerprint: pub ? computeKeyFingerprint(pub) : undefined,
    privateKeyConfigured,
    nextPublicKeyConfigured,
    nextPublicKeyMatches,
    subjectConfigured,
    subject: subject || undefined,
    pairValid: validation.valid,
    error: validation.error,
  };
}

/**
 * Compare Hostinger / Server ENV configuration against Database configuration.
 */
export async function compareEnvVsDb(envOverride?: Record<string, string | undefined>): Promise<EnvDbComparison> {
  const env = envOverride || process.env;
  const envPub = (env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const envNextPub = (env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "").trim();
  const envPriv = (env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const envSubject = (env.WEB_PUSH_SUBJECT || env.WEB_PUSH_CONTACT || "").trim();

  let dbConfig: SystemPushConfigSafe | null = null;
  let dbDecryptedPriv = "";
  try {
    const raw = await getSystemPushConfig();
    if (raw) {
      dbConfig = {
        ...raw,
        privateKeyConfigured: Boolean(raw.privateKeyEncrypted),
      };
      if (raw.privateKeyEncrypted) {
        dbDecryptedPriv = decryptSecret(raw.privateKeyEncrypted);
      }
    }
  } catch {
    dbConfig = null;
  }

  const hasEnv = Boolean(envPub && envPriv);
  const hasDb = Boolean(dbConfig && dbConfig.publicKey);

  if (!hasEnv && !hasDb) {
    return {
      publicKeyMatch: false,
      privateKeyMatch: false,
      nextPublicKeyMatch: false,
      subjectMatch: false,
      overallStatus: "missing_env",
    };
  }

  if (hasEnv && !hasDb) {
    return {
      publicKeyMatch: false,
      privateKeyMatch: false,
      nextPublicKeyMatch: Boolean(envNextPub && envPub === envNextPub),
      subjectMatch: false,
      overallStatus: "not_in_db",
      envFingerprint: computeKeyFingerprint(envPub),
      envSubject,
    };
  }

  if (!hasEnv && hasDb) {
    return {
      publicKeyMatch: false,
      privateKeyMatch: false,
      nextPublicKeyMatch: false,
      subjectMatch: false,
      overallStatus: "missing_env",
      dbFingerprint: dbConfig?.publicKeyFingerprint,
      dbSubject: dbConfig?.subject,
    };
  }

  const publicKeyMatch = envPub === dbConfig?.publicKey;
  const privateKeyMatch = Boolean(
    envPriv && dbDecryptedPriv && computeSecretHash(envPriv) === computeSecretHash(dbDecryptedPriv)
  );
  const nextPublicKeyMatch = Boolean(envNextPub && dbConfig && envNextPub === dbConfig.publicKey);
  const subjectMatch = Boolean(envSubject && dbConfig && envSubject === dbConfig.subject);

  const allMatch = publicKeyMatch && privateKeyMatch && subjectMatch;

  return {
    publicKeyMatch,
    privateKeyMatch,
    nextPublicKeyMatch,
    subjectMatch,
    overallStatus: allMatch ? "synced" : "mismatch",
    envFingerprint: computeKeyFingerprint(envPub),
    dbFingerprint: dbConfig?.publicKeyFingerprint,
    envSubject,
    dbSubject: dbConfig?.subject,
  };
}

/**
 * 1-Click Scan & Sync pipeline:
 * 1. Read ENV
 * 2. Validate format and pair
 * 3. Compare with DB
 * 4. Encrypt private key with AES-256-GCM
 * 5. Save & activate in DB
 * 6. Invalidate cache
 * 7. Run health check
 */
export async function syncEnvToDb(
  adminEmail: string,
  envOverride?: Record<string, string | undefined>
): Promise<{
  success: boolean;
  message: string;
  config?: SystemPushConfigSafe;
  health: WebPushHealthStatus;
}> {
  const env = envOverride || process.env;
  const envPub = (env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const envPriv = (env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const envSubject = (
    env.WEB_PUSH_SUBJECT ||
    env.WEB_PUSH_CONTACT ||
    "mailto:admin@signup888.shop"
  ).trim();

  if (!envPub) {
    throw new Error("Cannot sync: WEB_PUSH_PUBLIC_KEY is not defined in the server environment.");
  }
  if (!envPriv) {
    throw new Error("Cannot sync: WEB_PUSH_PRIVATE_KEY is not defined in the server environment.");
  }

  const validation = validateVapidKeys(envPub, envPriv);
  if (!validation.valid) {
    throw new Error(`Environment VAPID keys are invalid: ${validation.error || "Unknown validation error"}`);
  }

  const currentDb = await getSystemPushConfig().catch(() => null);
  const fingerprint = computeKeyFingerprint(envPub);

  // Check if already identical
  let alreadySynced = false;
  if (currentDb && currentDb.publicKey === envPub && currentDb.subject === envSubject) {
    try {
      const decrypted = decryptSecret(currentDb.privateKeyEncrypted);
      if (decrypted === envPriv) {
        alreadySynced = true;
      }
    } catch {
      alreadySynced = false;
    }
  }

  let configVersion = currentDb?.configVersion || 1;
  if (currentDb && currentDb.publicKeyFingerprint !== fingerprint) {
    configVersion += 1;
  }

  const encryptedPrivate = encryptSecret(envPriv);

  const saved = await saveSystemPushConfig({
    publicKey: envPub,
    privateKeyEncrypted: encryptedPrivate,
    subject: envSubject,
    enabled: true,
    source: "env_sync",
    publicKeyFingerprint: fingerprint,
    configVersion,
    updatedBy: adminEmail,
    lastSyncedAt: new Date().toISOString(),
    lastTestedAt: currentDb?.lastTestedAt || null,
    lastTestStatus: currentDb?.lastTestStatus || null,
  });

  invalidatePushConfigCache();

  await addSystemPushAuditLog(
    adminEmail,
    alreadySynced ? "sync_verified" : "env_sync",
    {
      fingerprint,
      configVersion,
      source: "env_sync",
      alreadySynced,
    }
  );

  const health = await getPushHealth();

  return {
    success: true,
    message: alreadySynced
      ? "Web Push configuration is already synchronized with environment."
      : "Successfully synchronized Web Push configuration from environment.",
    config: {
      ...saved,
      privateKeyConfigured: true,
    },
    health,
  };
}

/**
 * Manually save and activate VAPID configuration.
 * Includes rotation warning if public key fingerprint changes.
 */
export async function savePushConfig(
  input: {
    publicKey: string;
    privateKey?: string;
    subject?: string;
    enabled?: boolean;
    active?: boolean;
    rotateConfirmed?: boolean;
    actorEmail?: string;
  },
  adminEmail?: string
): Promise<{
  success: boolean;
  warning?: "rotation_required";
  message: string;
  config?: SystemPushConfigSafe;
  currentFingerprint?: string;
  newFingerprint?: string;
  subscriberCount?: number;
  health?: WebPushHealthStatus;
}> {
  const actor = adminEmail || input.actorEmail || "master-admin";
  const isEnabled = input.enabled !== undefined ? input.enabled : input.active !== undefined ? input.active : true;
  const pub = input.publicKey.trim();
  const priv = (input.privateKey || "").trim();
  const subject = (input.subject || "").trim() || "mailto:admin@signup888.shop";

  const currentDb = await getSystemPushConfig().catch(() => null);

  if (priv) {
    const validation = validateVapidKeys(pub, priv);
    if (!validation.valid) {
      throw new Error(`Invalid VAPID credentials: ${validation.error || "Key validation failed"}`);
    }
  }

  const newFingerprint = computeKeyFingerprint(pub);

  // Check for key rotation
  if (currentDb && currentDb.publicKeyFingerprint && currentDb.publicKeyFingerprint !== newFingerprint) {
    if (!input.rotateConfirmed) {
      const summary = await listPushSubscribers();
      return {
        success: false,
        warning: "rotation_required",
        message: "VAPID key change detected. Existing browser push subscriptions will require re-subscription.",
        currentFingerprint: currentDb.publicKeyFingerprint,
        newFingerprint,
        subscriberCount: (summary.total || 0) - (summary.inactive || 0),
      };
    }
  }

  let configVersion = currentDb?.configVersion || 1;
  if (currentDb && currentDb.publicKeyFingerprint !== newFingerprint) {
    configVersion += 1;
  }

  let encryptedPrivate = "";
  if (priv) {
    encryptedPrivate = encryptSecret(priv);
  } else if (currentDb?.privateKeyEncrypted) {
    encryptedPrivate = currentDb.privateKeyEncrypted;
  } else {
    throw new Error("Private key is required when configuring Web Push for the first time.");
  }

  const saved = await saveSystemPushConfig({
    publicKey: pub,
    privateKeyEncrypted: encryptedPrivate,
    subject,
    enabled: isEnabled,
    source: "manual",
    publicKeyFingerprint: newFingerprint,
    configVersion,
    updatedBy: actor,
    lastSyncedAt: currentDb?.lastSyncedAt || null,
    lastTestedAt: currentDb?.lastTestedAt || null,
    lastTestStatus: currentDb?.lastTestStatus || null,
  });

  invalidatePushConfigCache();

  await addSystemPushAuditLog(
    actor,
    currentDb && currentDb.publicKeyFingerprint !== newFingerprint ? "key_rotation" : "config_saved",
    {
      fingerprint: newFingerprint,
      configVersion,
      source: "manual",
      enabled: isEnabled,
    }
  );

  const health = await getPushHealth();

  return {
    success: true,
    message: "Successfully saved Web Push configuration.",
    config: {
      ...saved,
      privateKeyConfigured: true,
    },
    health,
  };
}

/**
 * Comprehensive health status check for Master Admin Web Push control center.
 */
export async function getPushHealth(): Promise<WebPushHealthStatus> {
  const active = await getActiveWebPushConfig();
  const subscribers = await listPushSubscribers().catch(() => ({ total: 0, inactive: 0 }));
  const testDevice = await getSystemTestDevice().catch(() => null);

  const publicKeyConfigured = Boolean(active?.publicKey);
  const privateKeyConfigured = Boolean(active?.privateKey);
  const subjectConfigured = Boolean(active?.subject);

  let pairValid = false;
  if (active?.publicKey && active?.privateKey) {
    const val = validateVapidKeys(active.publicKey, active.privateKey);
    pairValid = val.valid;
  }

  // Check service worker file existence
  let serviceWorkerAvailable = false;
  try {
    const swPath = path.join(process.cwd(), "public", "push-worker.js");
    serviceWorkerAvailable = fs.existsSync(swPath);
  } catch {
    serviceWorkerAvailable = false;
  }

  // Runtime public config is healthy if active config can produce valid public config
  const runtimePublicConfigHealthy = Boolean(pairValid && active?.publicKey);

  // Push worker is healthy if library can be configured with active config
  let pushWorkerHealthy = false;
  try {
    if (active?.publicKey && active?.privateKey && active?.subject) {
      webpush.setVapidDetails(active.subject, active.publicKey, active.privateKey);
      pushWorkerHealthy = true;
    }
  } catch {
    pushWorkerHealthy = false;
  }

  const dbConfig = await getSystemPushConfig().catch(() => null);

  return {
    enabled: Boolean(active?.enabled && pairValid),
    source: active?.source || "none",
    publicKeyConfigured,
    privateKeyConfigured,
    subjectConfigured,
    pairValid,
    runtimePublicConfigHealthy,
    serviceWorkerAvailable,
    pushWorkerHealthy,
    configVersion: active?.configVersion,
    fingerprint: active?.fingerprint,
    lastSyncedAt: dbConfig?.lastSyncedAt || null,
    lastTestedAt: dbConfig?.lastTestedAt || null,
    lastTestStatus: dbConfig?.lastTestStatus || null,
    activeSubscriberCount: Math.max(0, (subscribers.total || 0) - (subscribers.inactive || 0)),
    testDeviceConfigured: Boolean(testDevice),
  };
}

/**
 * Register Master Admin's current browser as the dedicated test device.
 */
export async function registerTestDevice(
  subscription: PushSubscriptionRecord,
  userAgent?: string,
  adminEmail?: string
) {
  const saved = await saveSystemTestDevice(subscription, userAgent);
  if (adminEmail) {
    await addSystemPushAuditLog(adminEmail, "test_device_registered", {
      endpointHash: saved.endpointHash,
      userAgent: userAgent?.slice(0, 100),
    });
  }
  return saved;
}

/**
 * Dispatch a real test push notification to the registered Master Admin test device.
 */
export async function sendTestPushToDevice(
  input: { title?: string; body?: string; url?: string },
  adminEmail: string
): Promise<{
  ok: boolean;
  success: boolean;
  statusCode?: number;
  message: string;
  error?: string;
  device?: { endpointHash: string; userAgent?: string };
}> {
  const device = await getSystemTestDevice();
  if (!device) {
    throw new Error("No test device registered yet. Please click 'Register My Test Device' first.");
  }

  const active = await getActiveWebPushConfig();
  if (!active || !active.publicKey || !active.privateKey) {
    throw new Error("Web Push is not configured yet. Please scan or configure VAPID keys first.");
  }

  webpush.setVapidDetails(active.subject, active.publicKey, active.privateKey);

  const payload = notificationPayload({
    title: input.title?.trim() || "Test Push Notification",
    body: input.body?.trim() || "Web Push configuration is working properly from Master Admin!",
    url: input.url?.trim() || "/",
  });

  try {
    const res = await webpush.sendNotification(device.subscription, payload, {
      TTL: 60,
      urgency: "high",
      timeout: 10000,
      vapidDetails: {
        subject: active.subject,
        publicKey: active.publicKey,
        privateKey: active.privateKey,
      },
    });

    const statusCode =
      res && typeof res === "object" && "statusCode" in res
        ? Number((res as { statusCode?: unknown }).statusCode)
        : 201;

    await updateSystemPushConfigTestStatus("success");
    await addSystemPushAuditLog(adminEmail, "test_push", {
      status: "success",
      statusCode,
      endpointHash: device.endpointHash,
    });

    return {
      ok: true,
      success: true,
      statusCode,
      message: `Test push accepted by push service (HTTP ${statusCode}) and dispatched to test device.`,
      device: {
        endpointHash: device.endpointHash,
        userAgent: device.userAgent,
      },
    };
  } catch (pushErr: unknown) {
    const errObj = pushErr as { statusCode?: unknown; body?: unknown; message?: string };
    const statusCode = Number(errObj?.statusCode || 0);
    const rawBody = typeof errObj?.body === "string" ? errObj.body : errObj?.message || "Push error";

    let safeError = rawBody;
    if (isAuthPushError(pushErr)) {
      safeError = `VAPID authentication error (HTTP ${statusCode}). The test device was subscribed with a different key pair. Please re-register your test device.`;
    } else if (isGonePushError(pushErr)) {
      safeError = `Subscription expired or revoked (HTTP ${statusCode}). Please re-register your test device.`;
    }

    await updateSystemPushConfigTestStatus("failed");
    await addSystemPushAuditLog(adminEmail, "test_push", {
      status: "failed",
      statusCode,
      error: safeError.slice(0, 200),
      endpointHash: device.endpointHash,
    });

    return {
      ok: false,
      success: false,
      statusCode,
      message: "Push delivery failed",
      error: safeError,
      device: {
        endpointHash: device.endpointHash,
        userAgent: device.userAgent,
      },
    };
  }
}
