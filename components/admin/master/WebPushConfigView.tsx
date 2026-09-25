"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  KeyRound,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type {
  SystemPushConfigSafe,
  SystemPushAuditLog,
  SystemPushTestDevice,
  EnvPushScanResult,
  EnvDbComparison,
  WebPushHealthStatus,
  RuntimePushPublicConfig,
} from "@/lib/types";
import { Button, Dialog, Field, IconButton, LoadingState } from "../AdminUI";

type ActiveConfigDisplay = {
  publicKey: string;
  privateKeyConfigured: boolean;
  subject: string;
  configVersion: number;
  fingerprint: string;
  source: "database" | "env" | "none";
  enabled: boolean;
};

type PushConfigApiResponse = {
  dbConfig: SystemPushConfigSafe | null;
  activeConfig: ActiveConfigDisplay | null;
  envScan: EnvPushScanResult;
  health: WebPushHealthStatus;
};

export function WebPushConfigView() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  // Core Data
  const [config, setConfig] = useState<SystemPushConfigSafe | null>(null);
  const [activeConfig, setActiveConfig] = useState<ActiveConfigDisplay | null>(null);
  const [envScan, setEnvScan] = useState<EnvPushScanResult | null>(null);
  const [health, setHealth] = useState<WebPushHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<SystemPushAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [testDevice, setTestDevice] = useState<SystemPushTestDevice | null>(null);

  // UI Modals & Toggles
  const [showFullPublicKey, setShowFullPublicKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonData, setComparisonData] = useState<EnvDbComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRotateWarningModal, setShowRotateWarningModal] = useState(false);

  // Manual Edit / Import Form State
  const [formPublicKey, setFormPublicKey] = useState("");
  const [formPrivateKey, setFormPrivateKey] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [rotationWarningDetails, setRotationWarningDetails] = useState<{
    currentFingerprint: string;
    newFingerprint: string;
    subscriberCount: number;
  } | null>(null);

  // Test Push Dispatcher Form State
  const [testTitle, setTestTitle] = useState("Signup Me Test Push");
  const [testBody, setTestBody] = useState("Web push delivery is working properly!");
  const [testUrl, setTestUrl] = useState("/");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    latencyMs?: number;
    message?: string;
  } | null>(null);
  const [registeringDevice, setRegisteringDevice] = useState(false);

  // Fetch initial master push status
  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/master/push-config", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load push configuration");
      const data: PushConfigApiResponse = await res.json();
      setConfig(data.dbConfig);
      setActiveConfig(data.activeConfig);
      setEnvScan(data.envScan);
      setHealth(data.health);

      // Prepopulate form if dbConfig exists
      if (data.dbConfig) {
        setFormPublicKey(data.dbConfig.publicKey || "");
        setFormSubject(data.dbConfig.subject || "");
      }
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Error loading data" });
    } finally {
      setLoading(false);
    }
  }

  // Load health diagnostics
  async function loadHealth() {
    try {
      setHealthLoading(true);
      const res = await fetch("/api/master/push-config/health", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { health: WebPushHealthStatus };
        setHealth(data.health);
      }
    } catch {
      // ignore
    } finally {
      setHealthLoading(false);
    }
  }

  // Load audit logs
  async function loadAuditLogs() {
    try {
      setAuditLoading(true);
      const res = await fetch("/api/master/push-config/audit-logs", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { auditLogs?: SystemPushAuditLog[]; logs?: SystemPushAuditLog[] };
        setAuditLogs(data.auditLogs || data.logs || []);
      }
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  }

  // Load test device
  async function loadTestDevice() {
    try {
      const res = await fetch("/api/master/push-config/test-device", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { testDevice?: SystemPushTestDevice | null; device?: SystemPushTestDevice | null };
        setTestDevice(data.testDevice || data.device || null);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadData();
    void loadAuditLogs();
    void loadTestDevice();
  }, []);

  // Copy to clipboard helper
  function copyText(text: string) {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  // 1-Click Scan & Sync
  async function handleScanAndSync() {
    try {
      setBusy(true);
      setNotice(null);
      const res = await fetch("/api/master/push-config/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as {
        success: boolean;
        message: string;
        config?: SystemPushConfigSafe;
        health?: WebPushHealthStatus;
        error?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to synchronize environment keys");
      }

      setNotice({ type: "success", message: "Environment keys successfully synchronized and activated in database!" });
      setShowRotateWarningModal(false);
      await loadData();
      await loadAuditLogs();
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setBusy(false);
    }
  }

  // Scan ENV
  async function handleScanEnv() {
    try {
      setBusy(true);
      setNotice(null);
      const res = await fetch("/api/master/push-config/scan-env", { method: "POST" });
      const data = (await res.json()) as { envScan?: EnvPushScanResult; env?: EnvPushScanResult; error?: string };
      const scanResult = data.envScan || data.env;
      if (!res.ok || !scanResult) throw new Error(data.error || "Scan failed");
      setEnvScan(scanResult);
      setNotice({ type: "success", message: "Environment scan completed successfully." });
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Scan failed" });
    } finally {
      setBusy(false);
    }
  }

  // Compare ENV vs DB
  async function handleCompare() {
    try {
      setComparing(true);
      const res = await fetch("/api/master/push-config/compare", { cache: "no-store" });
      const data = (await res.json()) as { comparison?: EnvDbComparison; error?: string };
      if (!res.ok || !data.comparison) throw new Error(data.error || "Comparison failed");
      setComparisonData(data.comparison);
      setShowCompareModal(true);
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Comparison failed" });
    } finally {
      setComparing(false);
    }
  }

  // Save manual / imported keys
  async function handleSaveManual(rotateConfirmed = false) {
    try {
      setBusy(true);
      setNotice(null);
      const res = await fetch("/api/master/push-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: formPublicKey.trim(),
          privateKey: formPrivateKey.trim() ? formPrivateKey.trim() : undefined,
          subject: formSubject.trim(),
          rotateConfirmed,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        warning?: "rotation_required";
        message?: string;
        currentFingerprint?: string;
        newFingerprint?: string;
        subscriberCount?: number;
        error?: string;
      };

      if (data.warning === "rotation_required" && data.currentFingerprint && data.newFingerprint) {
        setRotationWarningDetails({
          currentFingerprint: data.currentFingerprint,
          newFingerprint: data.newFingerprint,
          subscriberCount: data.subscriberCount ?? 0,
        });
        setShowRotateWarningModal(true);
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to save configuration");
      }

      setNotice({ type: "success", message: "Web Push configuration saved and activated successfully!" });
      setShowEditModal(false);
      setShowRotateWarningModal(false);
      setFormPrivateKey(""); // Clear sensitive form input
      await loadData();
      await loadAuditLogs();
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  // Register Current Browser as Test Device
  async function handleRegisterBrowser() {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotice({ type: "error", message: "Push notifications are not supported in this browser." });
      return;
    }

    try {
      setRegisteringDevice(true);
      setNotice(null);

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotice({ type: "warning", message: `Notification permission was ${perm}. Please allow notifications in browser settings.` });
        return;
      }

      // Fetch active public key from safe endpoint
      const configRes = await fetch("/api/public/push-config", { cache: "no-store" });
      const configData = (await configRes.json()) as RuntimePushPublicConfig;
      if (!configData.enabled || !configData.publicKey) {
        throw new Error("Push is currently disabled or no public key is active.");
      }

      // Convert base64 public key
      const raw = atob((configData.publicKey + "=".repeat((4 - (configData.publicKey.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
      const appServerKey = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));

      const reg = await navigator.serviceWorker.register("/push-worker.js");
      await navigator.serviceWorker.ready;

      // Subscribe browser
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // continue
        }
      }

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });

      const subJson = sub.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error("Incomplete push subscription generated by browser.");
      }

      // POST to master test-device endpoint
      const regRes = await fetch("/api/master/push-config/test-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            auth: subJson.keys.auth,
            p256dh: subJson.keys.p256dh,
          },
          userAgent: navigator.userAgent,
        }),
      });

      const regData = (await regRes.json()) as { testDevice?: SystemPushTestDevice; device?: SystemPushTestDevice; error?: string };
      const registeredDevice = regData.testDevice || regData.device;
      if (!regRes.ok || !registeredDevice) {
        throw new Error(regData.error || "Failed to register test device on server");
      }

      setTestDevice(registeredDevice);
      setNotice({ type: "success", message: "This browser was successfully registered as the active Test Device!" });
    } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Registration failed" });
    } finally {
      setRegisteringDevice(false);
    }
  }

  // Send Test Push
  async function handleSendTestPush() {
    try {
      setTestSending(true);
      setTestResult(null);
      const res = await fetch("/api/master/push-config/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: testTitle.trim() || "Test Push",
          body: testBody.trim() || "Test message",
          url: testUrl.trim() || "/",
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        delivery?: { statusCode: number; latencyMs?: number; responseBody?: string };
        error?: string;
      };
      if (!res.ok || !data.success) {
        setTestResult({
          success: false,
          statusCode: data.delivery?.statusCode || res.status,
          message: data.error || data.message || "Delivery failed",
        });
      } else {
        setTestResult({
          success: true,
          statusCode: data.delivery?.statusCode || 201,
          latencyMs: data.delivery?.latencyMs,
          message: "Notification delivered successfully to the registered test device!",
        });
        await loadData();
        await loadAuditLogs();
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to dispatch test push",
      });
    } finally {
      setTestSending(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading Web Push configuration..." />;
  }

  const activeSource = activeConfig?.source || (config?.enabled ? "database" : envScan?.publicKeyConfigured ? "env" : "none");
  const isEnabled = activeConfig?.enabled ?? false;

  return (
    <div className="masterView" style={{ display: "grid", gap: "24px" }}>
      {/* Page Header */}
      <div className="masterPageIntro" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="masterEyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <KeyRound size={14} /> Master Web Push & VAPID Control Center
          </span>
          <h2 style={{ fontSize: "28px", fontWeight: "700", marginTop: "4px" }}>Web Push Engine & Keys</h2>
          <p style={{ color: "var(--c-muted)", maxWidth: "70ch", marginTop: "6px" }}>
            Manage server VAPID cryptographic keys, synchronize Hostinger environment variables with the database, and monitor end-to-end push delivery.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button
            variant="outline"
            icon={RefreshCw}
            loading={healthLoading}
            onClick={() => {
              void loadData();
              void loadHealth();
              void loadAuditLogs();
            }}
          >
            Refresh All
          </Button>
          <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void handleScanAndSync()}>
            1-Click Scan & Sync
          </Button>
        </div>
      </div>

      {/* Global Alerts / Notices */}
      {notice && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            borderRadius: "var(--radius-lg)",
            border: notice.type === "error" ? "1px solid #f2cfd7" : notice.type === "warning" ? "1px solid #f0dcae" : "1px solid #c4e6d5",
            background: notice.type === "error" ? "var(--c-danger-soft)" : notice.type === "warning" ? "var(--c-warning-soft)" : "var(--c-success-soft)",
            color: notice.type === "error" ? "var(--c-danger)" : notice.type === "warning" ? "var(--c-warning)" : "var(--c-success)",
          }}
        >
          {notice.type === "error" ? <AlertCircle size={20} /> : notice.type === "warning" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <div style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>{notice.message}</div>
          <IconButton icon={X} label="Dismiss notice" onClick={() => setNotice(null)} />
        </div>
      )}

      {/* PANEL 1: Status Overview Card */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            padding: "20px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--c-muted)", fontWeight: "600", textTransform: "uppercase" }}>Push System</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 10px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: "700",
                background: isEnabled ? "var(--c-success-soft)" : "var(--c-danger-soft)",
                color: isEnabled ? "var(--c-success)" : "var(--c-danger)",
              }}
            >
              <i style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
              {isEnabled ? "ACTIVE & READY" : "DISABLED"}
            </span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "24px", fontWeight: "700" }}>{isEnabled ? "Operational" : "Not Configured"}</div>
          <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--c-muted)" }}>
            Resolver: <strong style={{ color: "var(--c-ink)" }}>{activeSource === "database" ? "Database (Primary)" : activeSource === "env" ? "Server ENV (Fallback)" : "None"}</strong>
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--c-muted)", fontWeight: "600", textTransform: "uppercase" }}>VAPID Keypair</span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>{config ? `v${config.configVersion}` : "ENV"}</span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "14px", fontFamily: "monospace", color: "var(--c-ink)", wordBreak: "break-all" }}>
            {activeConfig?.fingerprint || "No active key"}
          </div>
          <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--c-muted)" }}>
            Subject: <strong style={{ color: "var(--c-ink)" }}>{config?.subject || envScan?.subject || "Not set"}</strong>
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--c-muted)", fontWeight: "600", textTransform: "uppercase" }}>Active Subscribers</span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-accent)" }}>Live Count</span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "24px", fontWeight: "700" }}>{health?.activeSubscriberCount ?? 0}</div>
          <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--c-muted)" }}>
            Subscribed across all workspaces
          </div>
        </div>

        <div
          style={{
            padding: "20px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--c-muted)", fontWeight: "600", textTransform: "uppercase" }}>Live Test Status</span>
            <span
              style={{
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
                fontSize: "11px",
                fontWeight: "600",
                background: config?.lastTestStatus === "passed" ? "var(--c-success-soft)" : "var(--c-surface-sunken)",
                color: config?.lastTestStatus === "passed" ? "var(--c-success)" : "var(--c-muted)",
              }}
            >
              {config?.lastTestStatus?.toUpperCase() || "UNTESTED"}
            </span>
          </div>
          <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: "600" }}>
            {config?.lastTestedAt ? new Date(config.lastTestedAt).toLocaleString() : "Never dispatched"}
          </div>
          <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--c-muted)" }}>
            Test Device: <strong style={{ color: "var(--c-ink)" }}>{testDevice ? (testDevice.userAgent?.includes("Chrome") ? "Chrome Browser" : "Registered Browser") : "None registered"}</strong>
          </div>
        </div>
      </section>

      {/* PANEL 2 & 3: Two Column Layout for Active Config & Environment Config */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
        {/* PANEL 2: Active Push Configuration */}
        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "14px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Database Active Configuration</h3>
              <p style={{ fontSize: "13px", color: "var(--c-muted)", marginTop: "2px" }}>Persistent runtime keys stored securely in the database</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button size="sm" variant="outline" icon={Key} onClick={() => setShowEditModal(true)}>
                {config ? "Edit / Rotate" : "Enter Keys Manually"}
              </Button>
            </div>
          </div>

          {config ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)", textTransform: "uppercase" }}>Public Key (VAPID)</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <code
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--c-surface-sunken)",
                      border: "1px solid var(--c-line)",
                      fontSize: "12px",
                      wordBreak: "break-all",
                    }}
                  >
                    {showFullPublicKey ? config.publicKey : `${config.publicKey.substring(0, 18)}••••••••••••••••••••••••••••••••••••••••••••••`}
                  </code>
                  <IconButton
                    icon={showFullPublicKey ? EyeOff : Eye}
                    label={showFullPublicKey ? "Mask public key" : "Show full public key"}
                    onClick={() => setShowFullPublicKey(!showFullPublicKey)}
                  />
                  <IconButton icon={copiedKey ? Check : Copy} label="Copy public key" onClick={() => copyText(config.publicKey)} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)", textTransform: "uppercase" }}>Private Key (Server Only)</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "4px",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--c-surface-sunken)",
                    border: "1px solid var(--c-line)",
                  }}
                >
                  <Lock size={16} style={{ color: "var(--c-success)" }} />
                  <div style={{ fontSize: "13px" }}>
                    <strong>Configured & Encrypted</strong>
                    <div style={{ fontSize: "12px", color: "var(--c-muted)" }}>Protected with AES-256-GCM. Never exposed over APIs or bundles.</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)", textTransform: "uppercase" }}>Subject / Contact</label>
                  <div style={{ fontSize: "14px", fontWeight: "600", marginTop: "4px", wordBreak: "break-all" }}>{config.subject}</div>
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)", textTransform: "uppercase" }}>Version & Status</label>
                  <div style={{ fontSize: "14px", fontWeight: "600", marginTop: "4px" }}>
                    Version {config.configVersion} • {config.enabled ? <span style={{ color: "var(--c-success)" }}>Active</span> : "Inactive"}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)", textTransform: "uppercase" }}>Public Key Fingerprint (SHA-256)</label>
                <code
                  style={{
                    display: "block",
                    padding: "6px 10px",
                    marginTop: "4px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--c-surface-sunken)",
                    border: "1px solid var(--c-line)",
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  {config.publicKeyFingerprint}
                </code>
              </div>

              <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--c-muted)", borderTop: "1px solid var(--c-line)", paddingTop: "10px" }}>
                <span>Created: {new Date(config.createdAt).toLocaleDateString()}</span>
                <span>Updated: {new Date(config.updatedAt).toLocaleDateString()}</span>
                {config.updatedBy && <span>By: {config.updatedBy}</span>}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--c-muted)" }}>
              <KeyRound size={36} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--c-ink)" }}>No Database Configuration Stored</div>
              <p style={{ fontSize: "13px", marginTop: "6px", maxWidth: "40ch", margin: "6px auto 16px" }}>
                The application is either using Hostinger ENV fallback or Web Push is currently unconfigured.
              </p>
              <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void handleScanAndSync()}>
                1-Click Sync from Server ENV
              </Button>
            </div>
          )}
        </section>

        {/* PANEL 3: Hostinger / Server Environment Configuration */}
        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "14px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Hostinger / Server ENV</h3>
              <p style={{ fontSize: "13px", color: "var(--c-muted)", marginTop: "2px" }}>Environment variables detected on the node server</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button size="sm" variant="outline" icon={RefreshCw} loading={busy} onClick={() => void handleScanEnv()}>
                Scan ENV
              </Button>
              <Button size="sm" variant="outline" icon={ArrowRight} loading={comparing} onClick={() => void handleCompare()}>
                Compare
              </Button>
            </div>
          </div>

          {envScan ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "grid", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>WEB_PUSH_PUBLIC_KEY</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      color: envScan.publicKeyConfigured ? "var(--c-success)" : "var(--c-danger)",
                    }}
                  >
                    {envScan.publicKeyConfigured ? "CONFIGURED (65 BYTES)" : "NOT SET"}
                  </span>
                </div>
                <code
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--c-surface-sunken)",
                    border: "1px solid var(--c-line)",
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  {envScan.publicKeyPreview || "—"}
                </code>
              </div>

              <div style={{ display: "grid", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      color: envScan.nextPublicKeyMatches ? "var(--c-success)" : envScan.nextPublicKeyConfigured ? "var(--c-warning)" : "var(--c-muted)",
                    }}
                  >
                    {envScan.nextPublicKeyMatches ? "MATCHES SERVER KEY" : envScan.nextPublicKeyConfigured ? "MISMATCH" : "OPTIONAL (LEGACY)"}
                  </span>
                </div>
                <code
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--c-surface-sunken)",
                    border: "1px solid var(--c-line)",
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  {envScan.nextPublicKeyConfigured ? "Configured in ENV" : "(Migrated to dynamic /api/public/push-config)"}
                </code>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>WEB_PUSH_PRIVATE_KEY</span>
                  <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {envScan.privateKeyConfigured ? (
                      <span style={{ color: "var(--c-success)", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "600" }}>
                        <CheckCircle2 size={16} /> Configured
                      </span>
                    ) : (
                      <span style={{ color: "var(--c-muted)", fontSize: "13px" }}>Not set</span>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>ECDH P-256 PAIR</span>
                  <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {envScan.pairValid ? (
                      <span style={{ color: "var(--c-success)", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "600" }}>
                        <ShieldCheck size={16} /> Valid Keypair
                      </span>
                    ) : (
                      <span style={{ color: "var(--c-danger)", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "600" }}>
                        <ShieldAlert size={16} /> Invalid Keypair
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>WEB_PUSH_SUBJECT</span>
                <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: "600" }}>{envScan.subject || "Not set"}</div>
              </div>

              {envScan.error && (
                <div style={{ padding: "10px", borderRadius: "var(--radius-md)", background: "var(--c-danger-soft)", color: "var(--c-danger)", fontSize: "12px" }}>
                  <strong>Error in ENV:</strong> {envScan.error}
                </div>
              )}
            </div>
          ) : (
            <LoadingState label="Scanning environment..." />
          )}
        </section>
      </div>

      {/* PANEL 4 & 5: Health & Diagnostics */}
      <section
        style={{
          padding: "24px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--c-line)",
          background: "var(--c-surface)",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>System Health & Diagnostics</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", marginTop: "2px" }}>Continuous validation of cryptographic keys, endpoints, and worker scripts</p>
          </div>
          <Button size="sm" variant="outline" icon={RefreshCw} loading={healthLoading} onClick={() => void loadHealth()}>
            Run Diagnostics
          </Button>
        </div>

        {health ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Push Engine Core</span>
                {health.enabled ? <CheckCircle2 size={18} color="var(--c-success)" /> : <XCircle size={18} color="var(--c-danger)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                {health.enabled ? "Web push library initialized and ready for payloads" : "VAPID details not initialized"}
              </div>
            </div>

            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>ECDH P-256 Keypair</span>
                {health.pairValid ? <CheckCircle2 size={18} color="var(--c-success)" /> : <XCircle size={18} color="var(--c-danger)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                {health.pairValid ? "Public and private keys match elliptic curve standard" : "Cryptographic validation failed"}
              </div>
            </div>

            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Public Safe Endpoint</span>
                {health.runtimePublicConfigHealthy ? <CheckCircle2 size={18} color="var(--c-success)" /> : <XCircle size={18} color="var(--c-danger)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                <code style={{ fontSize: "11px" }}>/api/public/push-config</code> {health.runtimePublicConfigHealthy ? "serves matching key" : "unavailable or mismatched"}
              </div>
            </div>

            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Service Worker Script</span>
                {health.serviceWorkerAvailable ? <CheckCircle2 size={18} color="var(--c-success)" /> : <XCircle size={18} color="var(--c-danger)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                <code style={{ fontSize: "11px" }}>/push-worker.js</code> {health.serviceWorkerAvailable ? "accessible and readable" : "missing from public/"}
              </div>
            </div>

            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Push Worker Status</span>
                {health.pushWorkerHealthy ? <CheckCircle2 size={18} color="var(--c-success)" /> : <XCircle size={18} color="var(--c-danger)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                {health.pushWorkerHealthy ? "Worker file contains push and notificationclick handlers" : "Worker invalid"}
              </div>
            </div>

            <div style={{ padding: "14px", borderRadius: "var(--radius-md)", border: "1px solid var(--c-line)", background: "var(--c-surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Test Device</span>
                {health.testDeviceConfigured ? <CheckCircle2 size={18} color="var(--c-success)" /> : <AlertTriangle size={18} color="var(--c-warning)" />}
              </div>
              <div style={{ fontSize: "12px", color: "var(--c-muted)", marginTop: "4px" }}>
                {health.testDeviceConfigured ? "Test browser registered and ready" : "No test device registered yet"}
              </div>
            </div>
          </div>
        ) : (
          <LoadingState label="Running health checks..." />
        )}
      </section>

      {/* PANEL 6: Test Device & Test Push Dispatcher */}
      <section
        style={{
          padding: "24px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--c-line)",
          background: "var(--c-surface)",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Live Test Push Dispatcher</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", marginTop: "2px" }}>
              Send an instant cryptographic test push to a registered test device to verify real delivery
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px" }}>
          {/* Test Device Card */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h4 style={{ fontSize: "15px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <Smartphone size={18} /> Registered Test Device
            </h4>

            {testDevice ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--c-line)",
                  background: "var(--c-surface-sunken)",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "14px" }}>
                    {testDevice.userAgent?.includes("Chrome") ? "Chrome Browser" : "Registered Browser"}
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--c-success)", fontWeight: "600" }}>Active</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--c-muted)" }}>
                  Endpoint: <code style={{ fontSize: "11px" }}>{testDevice.subscription.endpoint.substring(0, 45)}...</code>
                </div>
                <div style={{ fontSize: "12px", color: "var(--c-muted)" }}>Registered: {new Date(testDevice.createdAt).toLocaleString()}</div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={Smartphone}
                  loading={registeringDevice}
                  onClick={() => void handleRegisterBrowser()}
                  style={{ marginTop: "6px" }}
                >
                  Re-register This Browser
                </Button>
              </div>
            ) : (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed var(--c-line)",
                  textAlign: "center",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <Smartphone size={28} style={{ margin: "0 auto", opacity: 0.4 }} />
                <div style={{ fontSize: "13px", color: "var(--c-muted)" }}>
                  No test device is currently registered. You can register this browser with one click to receive live test pushes.
                </div>
                <Button
                  variant="primary"
                  icon={Smartphone}
                  loading={registeringDevice}
                  onClick={() => void handleRegisterBrowser()}
                  style={{ justifySelf: "center" }}
                >
                  Register This Browser as Test Device
                </Button>
              </div>
            )}
          </div>

          {/* Test Push Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h4 style={{ fontSize: "15px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <Send size={18} /> Dispatch Test Notification
            </h4>

            <div style={{ display: "grid", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>Notification Title</label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--c-line)",
                    background: "var(--c-surface)",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>Message Body</label>
                <input
                  type="text"
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--c-line)",
                    background: "var(--c-surface)",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--c-muted)" }}>Click Target URL</label>
                <input
                  type="text"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--c-line)",
                    background: "var(--c-surface)",
                    marginTop: "4px",
                  }}
                />
              </div>

              <Button
                variant="primary"
                icon={Send}
                loading={testSending}
                disabled={!testDevice || !isEnabled}
                onClick={() => void handleSendTestPush()}
                style={{ marginTop: "8px" }}
              >
                Send Test Push Now
              </Button>

              {testResult && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-md)",
                    background: testResult.success ? "var(--c-success-soft)" : "var(--c-danger-soft)",
                    color: testResult.success ? "var(--c-success)" : "var(--c-danger)",
                    fontSize: "13px",
                    display: "grid",
                    gap: "4px",
                    marginTop: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}>
                    {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {testResult.success ? "Push Delivered Successfully" : "Push Delivery Failed"}
                    {testResult.statusCode && <span>(HTTP {testResult.statusCode})</span>}
                    {testResult.latencyMs && <span>in {testResult.latencyMs}ms</span>}
                  </div>
                  <div>{testResult.message}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PANEL 7: Audit Log Table */}
      <section
        style={{
          padding: "24px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--c-line)",
          background: "var(--c-surface)",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line)", paddingBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Configuration Audit Log</h3>
            <p style={{ fontSize: "13px", color: "var(--c-muted)", marginTop: "2px" }}>Traceability of key changes, synchronization events, and test dispatches</p>
          </div>
          <Button size="sm" variant="outline" icon={RefreshCw} loading={auditLoading} onClick={() => void loadAuditLogs()}>
            Refresh Logs
          </Button>
        </div>

        {auditLogs.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-line)", color: "var(--c-muted)" }}>
                  <th style={{ padding: "8px 12px" }}>Timestamp</th>
                  <th style={{ padding: "8px 12px" }}>Action</th>
                  <th style={{ padding: "8px 12px" }}>Actor</th>
                  <th style={{ padding: "8px 12px" }}>Fingerprint</th>
                  <th style={{ padding: "8px 12px" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => {
                  const detailsObj = (log.details as Record<string, unknown> | null) || {};
                  const fp = (detailsObj.fingerprint || detailsObj.keyFingerprint) as string | undefined;
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--c-line)" }}>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--c-muted)" }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "11px",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            background:
                              log.action === "env_sync"
                                ? "var(--c-accent-soft)"
                                : log.action === "key_rotation"
                                ? "var(--c-warning-soft)"
                                : log.action === "manual_update"
                                ? "var(--c-surface-sunken)"
                                : "var(--c-success-soft)",
                            color:
                              log.action === "env_sync"
                                ? "var(--c-accent)"
                                : log.action === "key_rotation"
                                ? "var(--c-warning)"
                                : log.action === "manual_update"
                                ? "var(--c-ink)"
                                : "var(--c-success)",
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: "600" }}>{log.adminEmail}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: "11px" }}>
                        {fp ? fp.substring(0, 17) + "..." : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--c-muted)" }}>
                        {typeof detailsObj.summary === "string" ? detailsObj.summary : JSON.stringify(detailsObj)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--c-muted)" }}>No audit records recorded yet.</div>
        )}
      </section>

      {/* DIALOG 1: Compare ENV vs DB */}
      {showCompareModal && comparisonData && (
        <Dialog title="Compare Server ENV vs Database Configuration" onClose={() => setShowCompareModal(false)} wide>
          <div style={{ display: "grid", gap: "16px" }}>
            <p style={{ fontSize: "14px", color: "var(--c-muted)" }}>
              Review the differences between your Hostinger server environment variables and the active database configuration.
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--c-line)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Property</th>
                  <th style={{ padding: "8px 12px" }}>Hostinger ENV</th>
                  <th style={{ padding: "8px 12px" }}>Database Active</th>
                  <th style={{ padding: "8px 12px" }}>Match</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--c-line)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: "600" }}>Key Fingerprint</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: "11px" }}>
                    {comparisonData.envFingerprint ? comparisonData.envFingerprint.substring(0, 17) + "..." : "Not in ENV"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: "11px" }}>
                    {comparisonData.dbFingerprint ? comparisonData.dbFingerprint.substring(0, 17) + "..." : "Not in DB"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {comparisonData.publicKeyMatch ? (
                      <CheckCircle2 size={16} color="var(--c-success)" />
                    ) : (
                      <XCircle size={16} color="var(--c-danger)" />
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: "1px solid var(--c-line)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: "600" }}>Private Key Match</td>
                  <td style={{ padding: "10px 12px" }}>Server ENV Key</td>
                  <td style={{ padding: "10px 12px" }}>Database Encrypted Key</td>
                  <td style={{ padding: "10px 12px" }}>
                    {comparisonData.privateKeyMatch ? (
                      <CheckCircle2 size={16} color="var(--c-success)" />
                    ) : (
                      <AlertTriangle size={16} color="var(--c-warning)" />
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: "1px solid var(--c-line)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: "600" }}>Subject</td>
                  <td style={{ padding: "10px 12px" }}>{comparisonData.envSubject || "Not set"}</td>
                  <td style={{ padding: "10px 12px" }}>{comparisonData.dbSubject || "Not set"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {comparisonData.subjectMatch ? (
                      <CheckCircle2 size={16} color="var(--c-success)" />
                    ) : (
                      <XCircle size={16} color="var(--c-danger)" />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <Button variant="outline" onClick={() => setShowCompareModal(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={Sparkles}
                loading={busy}
                onClick={async () => {
                  setShowCompareModal(false);
                  await handleScanAndSync();
                }}
              >
                Sync ENV to Database
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* DIALOG 2: Manual Edit / Import Keys Modal */}
      {showEditModal && (
        <Dialog title={config ? "Update Web Push Configuration" : "Import VAPID Keypair"} onClose={() => setShowEditModal(false)} wide>
          <div style={{ display: "grid", gap: "16px" }}>
            <p style={{ fontSize: "14px", color: "var(--c-muted)" }}>
              Enter valid VAPID keys. The private key will be encrypted using AES-256-GCM before saving into the database.
            </p>

            <Field label="VAPID Public Key (Uncompressed P-256 Base64url)" hint="Starts with B..., length is 87 characters (65 bytes)">
              <textarea
                rows={2}
                value={formPublicKey}
                onChange={(e) => setFormPublicKey(e.target.value)}
                placeholder="BOg..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--c-line)",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              />
            </Field>

            <Field
              label="VAPID Private Key (Base64url)"
              hint={config ? "Leave empty to keep current encrypted private key" : "32 bytes Base64url (43 characters)"}
            >
              <input
                type="password"
                value={formPrivateKey}
                onChange={(e) => setFormPrivateKey(e.target.value)}
                placeholder={config ? "•••••••••••••••• (Leave blank to keep existing key)" : "Enter private key"}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--c-line)",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              />
            </Field>

            <Field label="Subject / Contact" hint="Must be a valid mailto:email address or https:// URL">
              <input
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="mailto:admin@example.com"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--c-line)",
                }}
              />
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void handleSaveManual(false)}>
                Save Configuration
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* DIALOG 3: Key Rotation Warning Confirmation */}
      {showRotateWarningModal && rotationWarningDetails && (
        <Dialog title="Confirm VAPID Key Rotation" onClose={() => setShowRotateWarningModal(false)}>
          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px",
                borderRadius: "var(--radius-md)",
                background: "var(--c-warning-soft)",
                color: "var(--c-warning)",
                border: "1px solid #f0dcae",
              }}
            >
              <AlertTriangle size={24} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: "13px", lineHeight: "1.5" }}>
                <strong style={{ display: "block", fontSize: "14px", marginBottom: "4px" }}>
                  Warning: Existing Subscribers Will Be Invalidated
                </strong>
                Rotating your VAPID keys will invalidate existing browser push subscriptions for{" "}
                <strong>{rotationWarningDetails.subscriberCount} subscriber(s)</strong>. Browsers will reject future push notifications
                until visitors re-visit your site and re-opt in with the new public key.
              </div>
            </div>

            <div style={{ fontSize: "12px", color: "var(--c-muted)", display: "grid", gap: "6px" }}>
              <div>
                Current Key Fingerprint:{" "}
                <code style={{ fontFamily: "monospace" }}>{rotationWarningDetails.currentFingerprint}</code>
              </div>
              <div>
                New Key Fingerprint:{" "}
                <code style={{ fontFamily: "monospace" }}>{rotationWarningDetails.newFingerprint}</code>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <Button variant="outline" onClick={() => setShowRotateWarningModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={async () => {
                  await handleSaveManual(true);
                }}
              >
                Confirm Rotation & Save
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
