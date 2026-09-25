"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  Copy,
  FilePenLine,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import type { PublicWorkspaceUser } from "@/lib/workspaceUsers";
import { workspacePermissions, type WorkspacePermission, type WorkspaceRole } from "@/lib/permissions";
import { adminApi } from "@/lib/admin";
import { defaultBranding, type BrandingSettings } from "@/lib/brandingConstants";
import type { CustomDomain, DomainVerificationConfig } from "@/lib/domains";
import type { GeoIpHealth } from "@/lib/types";
import { ImageUploader } from "./ImageUploader";
import { Button, Dialog, EmptyState, Field, IconButton, LoadingState, SectionHeading } from "./admin/AdminUI";
import { WebPushConfigView } from "./admin/master/WebPushConfigView";
import "./admin/admin.css";

type MasterWorkspace = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  status: "active" | "disabled";
  createdAt: string;
  pages: number;
  admins: number;
  subscribers: number;
  domainId: string | null;
  domain: string | null;
  domainStatus: string | null;
};

type Payload = { workspaces: MasterWorkspace[]; defaultWorkspaceId: string };
type DomainsPayload = { domains: CustomDomain[]; verification: DomainVerificationConfig };
type SignupSettings = { enabled: boolean };
type GeoIpHealthPayload = {
  health: GeoIpHealth;
};
type MasterView = "overview" | "workspaces" | "domains" | "users" | "branding" | "signup" | "web-push";
type DomainModal = "add" | { action: "edit" | "assign" | "delete"; domain: CustomDomain } | null;

const views = [
  { id: "overview", label: "Overview", description: "Platform health", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", description: "Manage every workspace", icon: Building2 },
  { id: "domains", label: "Domains", description: "DNS and workspace routing", icon: Globe2 },
  { id: "users", label: "All users", description: "Accounts and access", icon: Users },
  { id: "branding", label: "Global branding", description: "Identity and assets", icon: Palette },
  { id: "signup", label: "Signup access", description: "Registration control", icon: UserPlus },
  { id: "web-push", label: "Web Push", description: "VAPID keys & push engine", icon: Bell },
] as const;

export function MasterDashboard({ email, initialView }: { email: string; initialView?: MasterView }) {
  const router = useRouter();
  const rawPathname = usePathname();

  const getComputedView = (): MasterView => {
    if (initialView) return initialView;
    if (!rawPathname) return "overview";
    if (rawPathname.includes("/workspaces")) return "workspaces";
    if (rawPathname.includes("/domains")) return "domains";
    if (rawPathname.includes("/users")) return "users";
    if (rawPathname.includes("/branding")) return "branding";
    if (rawPathname.includes("/signup")) return "signup";
    if (rawPathname.includes("/web-push")) return "web-push";
    return "overview";
  };

  const [view, setView] = useState<MasterView>(getComputedView);

  useEffect(() => {
    setView(getComputedView());
  }, [rawPathname, initialView]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [verification, setVerification] = useState<DomainVerificationConfig>({ configured: false, record: null, www: null });
  const [users, setUsers] = useState<PublicWorkspaceUser[]>([]);
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [signup, setSignup] = useState<SignupSettings>({ enabled: true });
  const [geoIp, setGeoIp] = useState<GeoIpHealthPayload["health"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState<MasterWorkspace | null>(null);
  const [domainDetail, setDomainDetail] = useState<CustomDomain | null>(null);
  const [domainModal, setDomainModal] = useState<DomainModal>(null);
  const [domainHostname, setDomainHostname] = useState("");
  const [domainWorkspaceId, setDomainWorkspaceId] = useState("");
  const [domainError, setDomainError] = useState("");

  // User management state
  const [userModal, setUserModal] = useState<"create" | { user: PublicWorkspaceUser; action: "password" | "permissions" } | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userWorkspaceId, setUserWorkspaceId] = useState("");
  const [userRole, setUserRole] = useState<WorkspaceRole>("owner");
  const [userPermissions, setUserPermissions] = useState<WorkspacePermission[]>([]);
  const [withPassword, setWithPassword] = useState(true);
  const [inviteUrl, setInviteUrl] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userWorkspaceFilter, setUserWorkspaceFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  // Workspace management state
  const [workspaceModal, setWorkspaceModal] = useState<"create" | MasterWorkspace | null>(null);
  const [wsName, setWsName] = useState("");
  const [wsOwnerEmail, setWsOwnerEmail] = useState("");
  const [wsOwnerName, setWsOwnerName] = useState("");
  const [wsWithPassword, setWsWithPassword] = useState(true);
  const [wsPassword, setWsPassword] = useState("");
  const [wsDomainId, setWsDomainId] = useState("");

  const load = useCallback(async () => {
    const [data, domainData, brand, signupSettings, accounts] = await Promise.all([
      adminApi<Payload>("/api/master/workspaces"),
      adminApi<DomainsPayload>("/api/master/domains"),
      adminApi<BrandingSettings>("/api/master/branding"),
      adminApi<SignupSettings>("/api/master/signup"),
      adminApi<PublicWorkspaceUser[]>("/api/master/users"),
    ]);
    adminApi<GeoIpHealthPayload>("/api/master/geoip").then(result => setGeoIp(result.health)).catch(() => setGeoIp(null));
    setWorkspaces(data.workspaces);
    setDomains(domainData.domains);
    setVerification(domainData.verification);
    setBranding(brand);
    setSignup(signupSettings);
    setUsers(accounts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void Promise.all([
      adminApi<Payload>("/api/master/workspaces", { signal: controller.signal }),
      adminApi<DomainsPayload>("/api/master/domains", { signal: controller.signal }),
      adminApi<BrandingSettings>("/api/master/branding", { signal: controller.signal }),
      adminApi<SignupSettings>("/api/master/signup", { signal: controller.signal }),
      adminApi<PublicWorkspaceUser[]>("/api/master/users", { signal: controller.signal }),
      adminApi<GeoIpHealthPayload>("/api/master/geoip", { signal: controller.signal }),
    ])
      .then(([data, domainData, brand, signupSettings, accounts, geoIpStatus]) => {
        if (cancelled) return;
        setWorkspaces(data.workspaces);
        setDomains(domainData.domains);
        setVerification(domainData.verification);
        setBranding(brand);
        setSignup(signupSettings);
        setUsers(accounts);
        setGeoIp(geoIpStatus.health);
      })
      .catch(cause => {
        if (!cancelled && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load platform data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh platform data."); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function saveBranding(next = branding) {
    if (savingBranding) return;
    setSavingBranding(true);
    setError("");
    setMessage("");
    try {
      setBranding(await adminApi<BrandingSettings>("/api/master/branding", {
        method: "PATCH",
        body: JSON.stringify(next),
      }));
      setMessage("Global branding saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save branding.");
    } finally {
      setSavingBranding(false);
    }
  }

  async function updateBrandingImage(key: "logo" | "favicon", value: string) {
    const next = { ...branding, [key]: value || defaultBranding[key] };
    setBranding(next);
    await saveBranding(next);
  }

  async function updateSignup(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setSignup(await adminApi<SignupSettings>("/api/master/signup", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }));
      setMessage(`Public signup turned ${enabled ? "on" : "off"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update signup.");
    } finally {
      setBusy(false);
    }
  }

  function navigate(next: MasterView) {
    setView(next);
    setMenuOpen(false);
    setMessage("");
    if (next === "overview") {
      router.push("/admin/master");
    } else {
      router.push(`/admin/master/${next}`);
    }
  }

  function logout() {
    void adminApi("/api/auth/logout", { method: "POST" }).then(() => {
      window.location.replace("/admin/login");
    });
  }

  async function openWorkspace(workspace: MasterWorkspace) {
    const result = await adminApi<{ launchUrl: string }>("/api/master/context", { method: "POST", body: JSON.stringify({ workspaceId: workspace.id }) });
    window.location.assign(result.launchUrl);
  }

  function openCreateWorkspaceModal() {
    setError("");
    setWsName("");
    setWsOwnerEmail("");
    setWsOwnerName("");
    setWsWithPassword(true);
    setWsPassword("");
    setWsDomainId("");
    setWorkspaceModal("create");
  }

  function openEditWorkspaceModal(workspace: MasterWorkspace) {
    setError("");
    setInspect(null);
    setWsName(workspace.name);
    setWsDomainId(workspace.domainId || "");
    setWorkspaceModal(workspace);
  }

  async function handleWorkspaceSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (workspaceModal === "create") {
        const result = await adminApi<{ ok: boolean; workspace: MasterWorkspace; invitePath?: string }>("/api/master/workspaces", {
          method: "POST",
          body: JSON.stringify({
            name: wsName,
            ownerEmail: wsOwnerEmail,
            ownerName: wsOwnerName,
            withPassword: wsWithPassword,
            password: wsPassword,
            ...(wsDomainId ? { domainId: wsDomainId } : {}),
          }),
        });
        if (result?.invitePath) setInviteUrl(new URL(result.invitePath, window.location.origin).href);
        setMessage(`Workspace "${wsName}" created successfully.`);
      } else if (workspaceModal) {
        await adminApi("/api/master/workspaces", {
          method: "PATCH",
          body: JSON.stringify({ id: workspaceModal.id, name: wsName, domainId: wsDomainId || null }),
        });
        setMessage(`Workspace "${wsName}" updated.`);
        setInspect(null);
      }
      setWorkspaceModal(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  function openDomainModal(modal: DomainModal) {
    setDomainError("");
    setDomainHostname(modal === "add" ? "" : modal?.domain.hostname || "");
    setDomainWorkspaceId(modal && modal !== "add" ? modal.domain.workspaceId || "" : "");
    setDomainModal(modal);
  }

  async function handleDomainSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !domainModal) return;
    setBusy(true);
    setDomainError("");
    setMessage("");
    try {
      if (domainModal === "add") {
        const result = await adminApi<{ domain: CustomDomain; verification: DomainVerificationConfig }>("/api/master/domains", {
          method: "POST",
          body: JSON.stringify({ hostname: domainHostname }),
        });
        setVerification(result.verification);
        setDomainDetail(result.domain);
        setMessage(`${result.domain.hostname} added. Add the DNS records shown below, then verify it.`);
      } else if (domainModal.action === "edit") {
        const result = await adminApi<{ domain: CustomDomain; verification: DomainVerificationConfig }>("/api/master/domains", {
          method: "PATCH",
          body: JSON.stringify({ id: domainModal.domain.id, action: "edit", hostname: domainHostname }),
        });
        setVerification(result.verification);
        setDomainDetail(result.domain);
        setMessage(`${result.domain.hostname} updated. DNS and SSL verification were reset.`);
      } else if (domainModal.action === "assign") {
        await adminApi("/api/master/domains", {
          method: "PATCH",
          body: JSON.stringify({ id: domainModal.domain.id, action: "assign", workspaceId: domainWorkspaceId || null }),
        });
        setMessage(domainWorkspaceId ? "Domain assignment updated." : "Domain unassigned.");
      } else {
        await adminApi("/api/master/domains", { method: "DELETE", body: JSON.stringify({ id: domainModal.domain.id }) });
        setDomainDetail(null);
        setMessage(`${domainModal.domain.hostname} deleted.`);
      }
      setDomainModal(null);
      await load();
    } catch (cause) {
      setDomainError(cause instanceof Error ? cause.message : "Could not update the domain.");
    } finally {
      setBusy(false);
    }
  }

  function openCreateUserModal() {
    setError("");
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserWorkspaceId(workspaces[0]?.id || "new");
    setUserRole("owner");
    setUserPermissions([...workspacePermissions]);
    setWithPassword(true);
    setUserModal("create");
  }

  function openEditUserModal(user: PublicWorkspaceUser, action: "password" | "permissions") {
    setError("");
    setUserPassword("");
    setUserRole(user.role);
    setUserPermissions(user.permissions ?? (user.role === "owner" ? [...workspacePermissions] : []));
    setUserModal({ user, action });
  }

  async function handleUserSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (userModal === "create") {
        const result = await adminApi<{ invitePath?: string }>("/api/master/users", {
          method: "POST",
          body: JSON.stringify({
            name: userName,
            email: userEmail,
            password: withPassword ? userPassword : "",
            workspaceId: userWorkspaceId,
            role: userRole,
            permissions: userPermissions,
          }),
        });
        if (result?.invitePath) {
          setInviteUrl(new URL(result.invitePath, window.location.origin).href);
        }
        setMessage(withPassword ? "Account created successfully." : "Invitation created successfully.");
        setUserModal(null);
        await load();
      } else if (userModal && typeof userModal === "object") {
        if (userModal.action === "password") {
          await adminApi("/api/master/users", {
            method: "PATCH",
            body: JSON.stringify({
              id: userModal.user.id,
              action: "password",
              password: userPassword,
            }),
          });
          setMessage(`Password reset for ${userModal.user.email}.`);
        } else if (userModal.action === "permissions") {
          await adminApi("/api/master/users", {
            method: "PATCH",
            body: JSON.stringify({
              id: userModal.user.id,
              action: "permissions",
              role: userRole,
              permissions: userPermissions,
            }),
          });
          setMessage(`Permissions updated for ${userModal.user.email}.`);
        }
        setUserModal(null);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const totals = workspaces.reduce((sum, workspace) => ({
    pages: sum.pages + workspace.pages,
    admins: sum.admins + workspace.admins,
    subscribers: sum.subscribers + workspace.subscribers,
  }), { pages: 0, admins: 0, subscribers: 0 });
  const activeWorkspaces = workspaces.filter(workspace => workspace.status === "active").length;
  const selected = views.find(item => item.id === view) ?? views[0];
  const filteredUsers = users.filter(user => {
    const workspace = workspaces.find(item => item.id === user.workspaceId);
    const query = userQuery.trim().toLowerCase();
    const status = user.pending ? "invited" : user.active ? "active" : "disabled";
    return (
      (!query || `${user.name} ${user.email} ${workspace?.name || user.workspaceId}`.toLowerCase().includes(query)) &&
      (userWorkspaceFilter === "all" || user.workspaceId === userWorkspaceFilter) &&
      (userRoleFilter === "all" || user.role === userRoleFilter) &&
      (userStatusFilter === "all" || status === userStatusFilter)
    );
  });

  function navigation(className: string) {
    return <aside className={className}>
      <div className="masterBrand">
        <span className="masterBrandMark"><Globe2 size={22} /></span>
        <span><strong>{branding.name || "signup888"}</strong><small>Control center</small></span>
        {className.includes("Drawer") && <IconButton icon={X} label="Close menu" onClick={() => setMenuOpen(false)} />}
      </div>
      <div className="masterIdentity">
        <span><ShieldCheck size={18} /></span>
        <div><small>Master administrator</small><strong>{email}</strong></div>
      </div>
      <nav aria-label="Master Admin sections">
        {views.map(item => {
          const href = item.id === "overview" ? "/admin/master" : `/admin/master/${item.id}`;
          const active = view === item.id;
          return (
            <Link
              key={item.id}
              href={href}
              className={active ? "masterNavActive" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setView(item.id);
                setMenuOpen(false);
                setMessage("");
              }}
            >
              <item.icon size={18} />
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <ArrowRight size={14} />
            </Link>
          );
        })}
      </nav>
      <button type="button" className="masterLogout" onClick={logout}><LogOut size={17} />Sign out</button>
    </aside>;
  }

  return <div className="masterShell">
    {navigation("masterSidebar")}
    {menuOpen && <><button type="button" className="masterBackdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />{navigation("masterDrawer")}</>}

    <div className="masterWorkspace">
      <header className="masterTopbar">
        <button type="button" className="masterMenuButton" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        <div><span>Master Admin / {selected.label}</span><h1>{selected.label}</h1></div>
        <Button icon={RefreshCw} loading={busy} disabled={loading} onClick={() => void refresh()}>Refresh</Button>
      </header>

      <main className="masterMain" aria-busy={busy || loading}>
        {error && !userModal && !workspaceModal && !domainModal && <div className="admError masterNotice" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError("")} /></div>}
        {message && <p className="admSuccess masterNotice" role="status">{message}</p>}
        {inviteUrl && <div className="admCard admFormStack masterNotice"><Field label="Invitation link" hint="Single-use link for the invited user."><input readOnly value={inviteUrl} onFocus={event => event.target.select()} /></Field><Button icon={Copy} onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage("Link copied to clipboard.")).catch(() => setError("Could not copy link."))}>Copy invitation link</Button></div>}
        {loading ? <LoadingState label="Loading your control center..." /> : <>
          {view === "overview" && <div className="masterView">
            <section className="masterHero">
              <div><span className="masterEyebrow"><ShieldCheck size={14} />Global platform access</span><h2>Everything important, at a glance.</h2><p>Monitor workspaces, accounts, pages and notification reach from one secure control center.</p></div>
              <div className="admActionRow">
                <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>Create workspace</Button>
                <button type="button" onClick={() => navigate("workspaces")}>Manage workspaces <ArrowRight size={16} /></button>
              </div>
            </section>
            <div className="masterMetrics">
              <article><span className="masterMetricIcon masterToneBlue"><Building2 size={20} /></span><div><small>Workspaces</small><strong>{workspaces.length}</strong><em>{activeWorkspaces} active</em></div></article>
              <article><span className="masterMetricIcon masterToneViolet"><Users size={20} /></span><div><small>User accounts</small><strong>{users.length}</strong><em>{totals.admins} admins</em></div></article>
              <article><span className="masterMetricIcon masterToneAmber"><LayoutDashboard size={20} /></span><div><small>Published assets</small><strong>{totals.pages}</strong><em>pages platform-wide</em></div></article>
              <article><span className="masterMetricIcon masterToneGreen"><Globe2 size={20} /></span><div><small>Push audience</small><strong>{totals.subscribers}</strong><em>subscribers</em></div></article>
              <article>
                <span className={`masterMetricIcon ${geoIp?.status === "active" ? "masterToneGreen" : geoIp?.status === "error" ? "masterToneAmber" : "masterToneViolet"}`}><Globe2 size={20} /></span>
                <div><small>GeoIP ({geoIp?.databaseType || "City"} DB)</small><strong>{geoIp?.database || "Unknown"}</strong><em>{geoIp?.lastSuccessfulCityLookup ? `last match ${formatDate(geoIp.lastSuccessfulCityLookup)}` : geoIp?.lastUpdated ? `updated ${formatDate(geoIp.lastUpdated)}` : geoIp?.reader || "health unavailable"}</em></div>
              </article>
            </div>
            {geoIp && (
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "var(--c-muted)", margin: "8px 0 16px 4px" }}>
                <span>Database: <strong style={{ color: geoIp.database === "Loaded" ? "var(--c-success, #16a34a)" : "inherit" }}>{geoIp.database}</strong></span>
                <span>•</span>
                <span>Type: <strong>{geoIp.databaseType || "City"}</strong></span>
                <span>•</span>
                <span>Lookup: <strong style={{ color: geoIp.lookupService === "Healthy" ? "var(--c-success, #16a34a)" : "inherit" }}>{geoIp.lookupService || "Healthy"}</strong></span>
                <span>•</span>
                <span>Client IP: <strong style={{ color: geoIp.clientIpExtraction === "Healthy" ? "var(--c-success, #16a34a)" : "inherit" }}>{geoIp.clientIpExtraction || "Healthy"}</strong></span>
                {geoIp.lastSuccessfulCityLookup && (
                  <>
                    <span>•</span>
                    <span>Last Match: <strong>{formatDate(geoIp.lastSuccessfulCityLookup)}</strong></span>
                  </>
                )}
              </div>
            )}
            {geoIp && geoIp.status !== "active" && <p className="admSetupNote masterNotice" role="status">GeoIP database is {geoIp.database.toLowerCase()}. {geoIp.error} Environment variable: {geoIp.pathConfigured ? "set" : "not set"}. Expected file: <code>{geoIp.pathHint}</code>.</p>}
            <section className="masterPanel">
              <SectionHeading title="Recent workspaces">
                <div className="admActionRow">
                  <Button size="sm" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>New workspace</Button>
                  <button type="button" className="masterTextButton" onClick={() => navigate("workspaces")}>View all <ArrowRight size={14} /></button>
                </div>
              </SectionHeading>
              <WorkspaceList workspaces={workspaces.slice(0, 5)} busy={busy} onInspect={setInspect} onOpen={workspace => void run(() => openWorkspace(workspace))} onEdit={openEditWorkspaceModal} onCreate={openCreateWorkspaceModal} />
            </section>
          </div>}

          {view === "workspaces" && <div className="masterView">
            <div className="masterPageIntro">
              <div><span>{workspaces.length} total</span><h2>Workspace management</h2><p>Inspect, enter, enable or disable every tenant from one place.</p></div>
              <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>Create workspace</Button>
            </div>
            <section className="masterPanel"><WorkspaceList workspaces={workspaces} busy={busy} onInspect={setInspect} onOpen={workspace => void run(() => openWorkspace(workspace))} onEdit={openEditWorkspaceModal} onToggle={workspace => void run(() => adminApi("/api/master/workspaces", { method: "PATCH", body: JSON.stringify({ id: workspace.id, status: workspace.status === "active" ? "disabled" : "active" }) }))} onCreate={openCreateWorkspaceModal} /></section>
          </div>}

          {view === "domains" && <div className="masterView">
            <div className="masterPageIntro">
              <div><span>{domains.length} configured</span><h2>Custom domains</h2><p>Connect branded hostnames, verify DNS, and control workspace routing.</p></div>
              <Button variant="primary" icon={Plus} disabled={busy} onClick={() => openDomainModal("add")}>Add domain</Button>
            </div>
            <div className="masterMetrics masterDomainMetrics">
              <article><span className="masterMetricIcon masterToneBlue"><Globe2 size={20} /></span><div><small>Total domains</small><strong>{domains.length}</strong><em>platform-wide</em></div></article>
              <article><span className="masterMetricIcon masterToneGreen"><CheckCircle2 size={20} /></span><div><small>Active</small><strong>{domains.filter(domain => domain.status === "active").length}</strong><em>DNS and SSL ready</em></div></article>
              <article><span className="masterMetricIcon masterToneAmber"><ShieldAlert size={20} /></span><div><small>Needs attention</small><strong>{domains.filter(domain => !["active", "disabled"].includes(domain.status)).length}</strong><em>pending or errored</em></div></article>
              <article><span className="masterMetricIcon masterToneViolet"><Building2 size={20} /></span><div><small>Assigned</small><strong>{domains.filter(domain => domain.workspaceId).length}</strong><em>{domains.filter(domain => !domain.workspaceId).length} available</em></div></article>
            </div>
            {!verification.configured && <p className="admSetupNote masterNotice" role="status">DNS verification is not configured. Set <code>CUSTOM_DOMAIN_CNAME_TARGET</code> or <code>CUSTOM_DOMAIN_SERVER_IP</code> on the server.</p>}
            <section className="masterPanel masterDomainPanel">
              {!domains.length ? <EmptyState icon={Globe2} title="No custom domains" description="Add a hostname to see the DNS records needed to connect it."><Button variant="primary" icon={Plus} onClick={() => openDomainModal("add")}>Add domain</Button></EmptyState> : <div className="masterDomainList">{domains.map(domain => {
                const workspace = workspaces.find(item => item.id === domain.workspaceId);
                return <article key={domain.id}>
                  <button type="button" className="masterDomainIdentity" onClick={() => setDomainDetail(domain)}>
                    <span><Globe2 size={19} /></span>
                    <div><strong>{domain.hostname}</strong><small>Added {formatDate(domain.createdAt)}</small></div>
                  </button>
                  <div className="masterDomainStatus"><small>Verification</small><DomainBadge status={domain.status} /></div>
                  <div className="masterDomainStatus"><small>SSL</small><DomainBadge status={domain.sslStatus} /></div>
                  <div className="masterDomainWorkspace"><small>Workspace</small><strong>{workspace?.name || "Unassigned"}</strong></div>
                  <div className="masterDomainActions">
                    <Button size="sm" icon={RefreshCw} disabled={busy || !verification.configured || domain.status === "disabled"} onClick={() => void run(async () => {
                      const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domain.id, action: "verify" }) });
                      if (domainDetail?.id === domain.id) setDomainDetail(result.domain);
                    })}>Verify</Button>
                    {domain.lastVerifiedAt && domain.sslStatus !== "active" && (
                      <Button size="sm" icon={ShieldCheck} disabled={busy} onClick={() => void run(() => adminApi("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domain.id, action: "ssl", sslStatus: "active" }) }))}>Activate SSL</Button>
                    )}
                    <Button size="sm" icon={Building2} disabled={busy} onClick={() => openDomainModal({ action: "assign", domain })}>{domain.workspaceId ? "Change workspace" : "Assign workspace"}</Button>
                    {domain.workspaceId && <Button size="sm" disabled={busy} onClick={() => void run(() => adminApi("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domain.id, action: "assign", workspaceId: null }) }))}>Unassign</Button>}
                    <IconButton icon={FilePenLine} label={`Edit ${domain.hostname}`} disabled={busy} onClick={() => openDomainModal({ action: "edit", domain })} />
                    <IconButton icon={Power} label={`${domain.status === "disabled" ? "Enable" : "Disable"} ${domain.hostname}`} disabled={busy} onClick={() => void run(() => adminApi("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domain.id, action: "disable", disabled: domain.status !== "disabled" }) }))} />
                    <IconButton icon={Trash2} tone="danger" label={`Delete ${domain.hostname}`} disabled={busy} onClick={() => openDomainModal({ action: "delete", domain })} />
                  </div>
                  {domain.verificationError && <p className="masterDomainError" role="status">{domain.verificationError}</p>}
                </article>;
              })}</div>}
            </section>
          </div>}

          {view === "users" && <div className="masterView">
            <div className="masterPageIntro">
              <div><span>{users.length} accounts</span><h2>All users</h2><p>Manage accounts and workspace access across the platform.</p></div>
              <div className="masterUserToolbarActions">
                <Button size="sm" icon={RefreshCw} disabled={busy} onClick={() => void refresh()}>Refresh</Button>
                <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateUserModal}>Add user / admin</Button>
              </div>
            </div>
            <section className="masterPanel masterUsersPanel">
              <div className="masterUserFilters" role="search">
                <input value={userQuery} onChange={event => setUserQuery(event.target.value)} placeholder="Search users..." aria-label="Search users" />
                <select value={userWorkspaceFilter} onChange={event => setUserWorkspaceFilter(event.target.value)} aria-label="Filter by workspace"><option value="all">All workspaces</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
                <select value={userRoleFilter} onChange={event => setUserRoleFilter(event.target.value)} aria-label="Filter by role"><option value="all">All roles</option><option value="owner">Admin / Owner</option><option value="member">Member</option></select>
                <select value={userStatusFilter} onChange={event => setUserStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="invited">Invited</option></select>
              </div>
              {!users.length ? <EmptyState title="No registered users found" /> : !filteredUsers.length ? <EmptyState title="No users match these filters" description="Try changing your search or filters." /> : <div className="masterUserList">
                <div className="masterUserTableHead" aria-hidden="true"><span>User</span><span>Workspace</span><span>Role</span><span>Status</span><span>Actions</span></div>
                {filteredUsers.map(user => {
                  const workspace = workspaces.find(item => item.id === user.workspaceId);
                  return <article key={user.id}>
                    <div className="masterUserIdentity"><span className="masterUserAvatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span><span className="masterUserName"><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></span></div>
                    <div className="masterUserWorkspace" data-label="Workspace"><strong>{workspace?.name || user.workspaceId}</strong></div>
                    <div className="masterUserRole" data-label="Role"><span className="admBadge">{user.role === "owner" ? "Admin / Owner" : "Member"}</span></div>
                    <div className="masterUserStatus" data-label="Status"><span className={`admBadge admBadge-${user.pending ? "" : user.active ? "published" : "disabled"}`}>{user.pending ? "Invited" : user.active ? "Active" : "Disabled"}</span></div>
                    <div className="masterUserActions">
                      <IconButton icon={Settings2} label={`Permissions for ${user.email}`} disabled={busy} onClick={() => openEditUserModal(user, "permissions")} />
                      {!user.pending && <IconButton icon={KeyRound} label={`Reset password for ${user.email}`} disabled={busy} onClick={() => openEditUserModal(user, "password")} />}
                      <IconButton icon={user.active ? UserX : UserCheck} label={`${user.active ? "Disable" : "Enable"} ${user.email}`} disabled={busy} onClick={() => void run(() => adminApi("/api/master/users", { method: "PATCH", body: JSON.stringify({ id: user.id, action: "access", active: !user.active }) }))} />
                      <IconButton icon={ArrowUpRight} label={`Open workspace for ${user.email}`} disabled={!workspace} onClick={() => { if (workspace) void run(() => openWorkspace(workspace)); }} />
                      <IconButton icon={Trash2} tone="danger" label={`Delete ${user.email}`} disabled={busy} onClick={() => void run(() => adminApi("/api/master/users", { method: "DELETE", body: JSON.stringify({ id: user.id }) }))} />
                    </div>
                  </article>;
                })}
              </div>}
            </section>
          </div>}

          {view === "branding" && <div className="masterView">
            <div className="masterPageIntro"><div><span>Platform identity</span><h2>Global branding</h2><p>Update the identity shown across authentication and administration screens.</p></div></div>
            <section className="masterPanel masterBrandingLayout">
              <div className="masterBrandPreview">
                <span>Live preview</span>
                <div><Image src={branding.logo} alt="" width={58} height={58} unoptimized /><strong>{branding.name}</strong></div>
                <p>{branding.siteTitle}</p>
              </div>
              <div className="masterBrandForm">
                <div className="admFormGrid">
                  <Field label="Brand name"><input maxLength={80} value={branding.name} onChange={event => setBranding({ ...branding, name: event.target.value })} /></Field>
                  <Field label="Site title"><input maxLength={140} value={branding.siteTitle} onChange={event => setBranding({ ...branding, siteTitle: event.target.value })} /></Field>
                  <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="logo" label="Platform logo" round value={branding.logo} onChange={logo => void updateBrandingImage("logo", logo)} /></div>
                  <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="favicon" label="Browser favicon" value={branding.favicon} onChange={favicon => void updateBrandingImage("favicon", favicon)} /></div>
                </div>
                <div className="admFormFooter"><Button variant="primary" loading={savingBranding} onClick={() => void saveBranding()}>Save global branding</Button></div>
              </div>
            </section>
          </div>}

          {view === "signup" && <div className="masterView">
            <div className="masterPageIntro"><div><span>Platform access</span><h2>Public signup</h2><p>Control whether new people can create independent workspaces.</p></div></div>
            <section className={`masterAccessCard ${signup.enabled ? "masterAccessOn" : "masterAccessOff"}`}>
              <span className="masterAccessIcon"><UserPlus size={26} /></span>
              <div><span className="masterEyebrow">Current status</span><h2>Public signup is {signup.enabled ? "open" : "closed"}</h2><p>{signup.enabled ? "New users can register and receive a clean, isolated workspace." : "New registrations are blocked. Existing users can still sign in normally."}</p></div>
              <Button variant="primary" icon={Power} disabled={busy} onClick={() => void updateSignup(!signup.enabled)}>Turn signup {signup.enabled ? "off" : "on"}</Button>
            </section>
          </div>}

          {view === "web-push" && <WebPushConfigView />}
        </>}
      </main>
    </div>

    {inspect && <Dialog title={inspect.name} onClose={() => setInspect(null)}>
      <dl className="admMasterDetail">
        <div><dt>Workspace ID</dt><dd>{inspect.id}</dd></div>
        <div><dt>Owner</dt><dd>{inspect.ownerName}</dd></div>
        <div><dt>Owner email</dt><dd>{inspect.ownerEmail}</dd></div>
        <div><dt>Status</dt><dd>{inspect.status}</dd></div>
        <div><dt>Created</dt><dd>{inspect.createdAt ? new Date(inspect.createdAt).toLocaleString() : "-"}</dd></div>
        <div><dt>Pages</dt><dd>{inspect.pages}</dd></div>
        <div><dt>Admins</dt><dd>{inspect.admins}</dd></div>
        <div><dt>Subscribers</dt><dd>{inspect.subscribers}</dd></div>
        <div><dt>Custom domain</dt><dd>{inspect.domain || "Use Default Domain"}{inspect.domain && <small className="masterDomainState">{inspect.domainStatus === "active" ? "Active" : inspect.domainStatus || "Pending"}</small>}</dd></div>
      </dl>
      <div className="admDialogActions"><Button icon={FilePenLine} onClick={() => openEditWorkspaceModal(inspect)}>Edit workspace</Button></div>
    </Dialog>}

    {domainDetail && <Dialog title={domainDetail.hostname} onClose={() => setDomainDetail(null)}>
      <dl className="admMasterDetail">
        <div><dt>Verification</dt><dd><DomainBadge status={domainDetail.status} /></dd></div>
        <div><dt>SSL</dt><dd><DomainBadge status={domainDetail.sslStatus} /></dd></div>
        <div><dt>Workspace</dt><dd>{workspaces.find(workspace => workspace.id === domainDetail.workspaceId)?.name || "Unassigned"}</dd></div>
        <div><dt>Created</dt><dd>{formatDate(domainDetail.createdAt)}</dd></div>
        <div><dt>Last checked</dt><dd>{domainDetail.lastCheckedAt ? formatDate(domainDetail.lastCheckedAt) : "Not checked"}</dd></div>
      </dl>
      {domainDetail.verificationError && <p className="admError masterDomainDialogError" role="alert">{domainDetail.verificationError}</p>}
      <DnsInstructions verification={verification} />
      <div className="admDialogActions">
        <Button icon={FilePenLine} onClick={() => { const domain = domainDetail; setDomainDetail(null); openDomainModal({ action: "edit", domain }); }}>Edit domain</Button>
        {domainDetail.lastVerifiedAt && domainDetail.sslStatus !== "active" && (
          <Button variant="secondary" icon={ShieldCheck} disabled={busy} onClick={() => void run(async () => {
            const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domainDetail.id, action: "ssl", sslStatus: "active" }) });
            setDomainDetail(result.domain);
          })}>Activate SSL</Button>
        )}
        <Button variant="primary" icon={RefreshCw} disabled={busy || !verification.configured || domainDetail.status === "disabled"} onClick={() => void run(async () => {
          const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", { method: "PATCH", body: JSON.stringify({ id: domainDetail.id, action: "verify" }) });
          setDomainDetail(result.domain);
        })}>Verify DNS</Button>
      </div>
    </Dialog>}

    {domainModal && <Dialog
      title={domainModal === "add" ? "Add custom domain" : domainModal.action === "edit" ? "Edit domain" : domainModal.action === "assign" ? "Assign workspace" : "Delete domain"}
      onClose={() => { if (!busy) { setDomainModal(null); setDomainError(""); } }}
    >
      <form onSubmit={handleDomainSubmit}>
        <fieldset disabled={busy} className="admTeamFields">
          <div className="admFormStack">
            {(domainModal === "add" || domainModal.action === "edit") && <>
              <Field label="Domain" hint="Enter a hostname such as example.com. HTTPS and www are optional and will be removed automatically.">
                <input required inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="example.com" value={domainHostname} onChange={event => setDomainHostname(event.target.value)} />
              </Field>
              {domainModal !== "add" && domainHostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") !== domainModal.domain.hostname && <p className="admSetupNote">Changing the hostname resets DNS verification and SSL status. The workspace assignment is preserved.</p>}
            </>}
            {domainModal !== "add" && domainModal.action === "assign" && <>
              <p className="admMuted">Choose a workspace with no custom domain. Moving this domain away from its current workspace is completed atomically.</p>
              <Field label="Workspace">
                <select value={domainWorkspaceId} onChange={event => setDomainWorkspaceId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {workspaces.filter(workspace => !workspace.domainId || workspace.id === domainModal.domain.workspaceId).map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </Field>
            </>}
            {domainModal !== "add" && domainModal.action === "delete" && <p>Delete <strong>{domainModal.domain.hostname}</strong>? Its workspace assignment and domain history will no longer be available from this record. This cannot be undone.</p>}
            {domainError && <p className="admError" role="alert" tabIndex={-1}>{domainError}</p>}
          </div>
        </fieldset>
        <div className="admDialogActions">
          <button type="button" className="admButton" disabled={busy} onClick={() => { setDomainModal(null); setDomainError(""); }}>Cancel</button>
          <button type="submit" className={`admButton ${domainModal !== "add" && domainModal.action === "delete" ? "admDestructive" : "admPrimary"}`} disabled={busy}>
            {busy ? "Saving..." : domainModal === "add" ? "Add domain" : domainModal.action === "edit" ? "Save domain" : domainModal.action === "assign" ? "Save assignment" : "Delete domain"}
          </button>
        </div>
      </form>
    </Dialog>}

    {userModal && <Dialog
      title={userModal === "create" ? "Add user / admin" : userModal.action === "password" ? `Reset password: ${userModal.user.email}` : `Permissions: ${userModal.user.email}`}
      onClose={() => { if (!busy) { setUserModal(null); setUserPassword(""); setError(""); } }}
    >
      <form onSubmit={handleUserSubmit}>
        <fieldset disabled={busy} className="admTeamFields">
          <div className="admFormStack">
            {userModal === "create" && <>
              <Field label="Name"><input required maxLength={120} autoComplete="name" value={userName} onChange={event => setUserName(event.target.value)} /></Field>
              <Field label="Email"><input required type="email" maxLength={190} autoComplete="off" value={userEmail} onChange={event => setUserEmail(event.target.value)} /></Field>
              <Field label="Workspace">
                <select value={userWorkspaceId} onChange={event => setUserWorkspaceId(event.target.value)}>
                  <option value="new">+ Create a new isolated workspace</option>
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name} ({w.ownerEmail})</option>)}
                </select>
              </Field>
              <Field label="Role">
                <select value={userRole} onChange={event => setUserRole(event.target.value as WorkspaceRole)}>
                  <option value="owner">Workspace Admin / Owner</option>
                  <option value="member">Member</option>
                </select>
              </Field>
              {userRole === "member" && <fieldset>
                <legend>Permissions</legend>
                {workspacePermissions.map(permission => <label className="admCheck" key={permission}>
                  <input
                    type="checkbox"
                    checked={userPermissions.includes(permission)}
                    onChange={event => setUserPermissions(current => event.target.checked ? [...current, permission] : current.filter(item => item !== permission))}
                  />
                  {permission}
                </label>)}
              </fieldset>}
              <label className="admCheck">
                <input type="checkbox" checked={withPassword} onChange={event => setWithPassword(event.target.checked)} />
                Set a password now (immediate access)
              </label>
            </>}

            {userModal && typeof userModal === "object" && userModal.action === "permissions" && <>
              <Field label="Role">
                <select value={userRole} onChange={event => setUserRole(event.target.value as WorkspaceRole)}>
                  <option value="owner">Workspace Admin / Owner</option>
                  <option value="member">Member</option>
                </select>
              </Field>
              {userRole === "member" && <fieldset>
                <legend>Permissions</legend>
                {workspacePermissions.map(permission => <label className="admCheck" key={permission}>
                  <input
                    type="checkbox"
                    checked={userPermissions.includes(permission)}
                    onChange={event => setUserPermissions(current => event.target.checked ? [...current, permission] : current.filter(item => item !== permission))}
                  />
                  {permission}
                </label>)}
              </fieldset>}
            </>}

            {(userModal === "create" && withPassword || (userModal && typeof userModal === "object" && userModal.action === "password")) && <Field label="Password" hint="At least 8 characters.">
              <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={userPassword} onChange={event => setUserPassword(event.target.value)} />
            </Field>}

            {error && <p className="admError" role="alert">{error}</p>}
          </div>
        </fieldset>
        <div className="admDialogActions">
          <button type="button" className="admButton" disabled={busy} onClick={() => { setUserModal(null); setUserPassword(""); setError(""); }}>Cancel</button>
          <button type="submit" className="admButton admPrimary" disabled={busy}>
            {busy ? "Saving..." : userModal === "create" ? withPassword ? "Create account" : "Create invitation" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>}

    {workspaceModal && <Dialog
      title={workspaceModal === "create" ? "Create new workspace" : `Edit ${workspaceModal.name}`}
      onClose={() => { if (!busy) { setWorkspaceModal(null); setWsPassword(""); setError(""); } }}
    >
      <form onSubmit={handleWorkspaceSubmit}>
        <fieldset disabled={busy} className="admTeamFields">
          <div className="admFormStack">
            <Field label="Workspace name" hint="A distinct name for this workspace.">
              <input
                required
                maxLength={190}
                placeholder="e.g. Acme Studio"
                value={wsName}
                onChange={event => setWsName(event.target.value)}
              />
            </Field>
            {workspaceModal === "create" && <><Field label="Owner email" hint="Leave blank to assign to Master Admin, or specify a tenant owner.">
              <input
                type="email"
                maxLength={190}
                autoComplete="off"
                placeholder={email}
                value={wsOwnerEmail}
                onChange={event => setWsOwnerEmail(event.target.value)}
              />
            </Field>

            {wsOwnerEmail.trim() && wsOwnerEmail.trim().toLowerCase() !== email.toLowerCase() && <>
              <Field label="Owner name">
                <input
                  maxLength={120}
                  autoComplete="name"
                  placeholder="e.g. John Doe"
                  value={wsOwnerName}
                  onChange={event => setWsOwnerName(event.target.value)}
                />
              </Field>

              <label className="admCheck">
                <input
                  type="checkbox"
                  checked={wsWithPassword}
                  onChange={event => setWsWithPassword(event.target.checked)}
                />
                Set a password now (immediate access)
              </label>

              {wsWithPassword ? (
                <Field label="Owner password" hint="At least 8 characters.">
                  <input
                    required
                    type="password"
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={wsPassword}
                    onChange={event => setWsPassword(event.target.value)}
                  />
                </Field>
              ) : (
                <p className="admMuted admSmall">An expiring invitation link will be generated after creation.</p>
              )}
            </>}</>}

            <Field label="Assign domain" hint="Select a custom domain for this workspace. Use the default domain to remove a custom assignment.">
              <select value={wsDomainId} onChange={event => setWsDomainId(event.target.value)}>
                <option value="">Use Default Domain</option>
                {domains
                  .filter(domain => !domain.workspaceId || domain.workspaceId === (workspaceModal === "create" ? null : workspaceModal.id) || domain.id === (workspaceModal === "create" ? null : workspaceModal.domainId))
                  .map(domain => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}
              </select>
            </Field>

            {error && <p className="admError" role="alert">{error}</p>}
          </div>
        </fieldset>
        <div className="admDialogActions">
          <button type="button" className="admButton" disabled={busy} onClick={() => { setWorkspaceModal(null); setWsPassword(""); setError(""); }}>Cancel</button>
          <button type="submit" className="admButton admPrimary" disabled={busy}>
            {busy ? "Saving..." : workspaceModal === "create" ? "Create workspace" : "Save workspace"}
          </button>
        </div>
      </form>
    </Dialog>}
  </div>;
}

function WorkspaceList({
  workspaces,
  busy,
  onInspect,
  onOpen,
  onEdit,
  onToggle,
  onCreate,
}: {
  workspaces: MasterWorkspace[];
  busy: boolean;
  onInspect: (workspace: MasterWorkspace) => void;
  onOpen: (workspace: MasterWorkspace) => void;
  onEdit: (workspace: MasterWorkspace) => void;
  onToggle?: (workspace: MasterWorkspace) => void;
  onCreate?: () => void;
}) {
  if (!workspaces.length) return <EmptyState title="No workspaces yet" description="Create an isolated workspace to get started.">{onCreate && <Button variant="primary" icon={Plus} onClick={onCreate}>Create workspace</Button>}</EmptyState>;
  return <div className="masterWorkspaceList">{workspaces.map(workspace => <article key={workspace.id}>
    <button type="button" className="masterWorkspaceIdentity" onClick={() => onInspect(workspace)}>
      <span><Building2 size={19} /></span>
      <div><strong>{workspace.name}</strong><small>{workspace.ownerEmail}</small><small className="masterWorkspaceDomain">{workspace.domain || "Default domain"}</small></div>
    </button>
    <span className={`admBadge admBadge-${workspace.status === "active" ? "published" : "disabled"}`}>{workspace.status}</span>
    <div className="masterWorkspaceStats"><span><small>Pages</small><strong>{workspace.pages}</strong></span><span><small>Admins</small><strong>{workspace.admins}</strong></span><span><small>Subscribers</small><strong>{workspace.subscribers}</strong></span></div>
    <div className="masterWorkspaceActions">
      <Button size="sm" disabled={busy} onClick={() => onOpen(workspace)}>Open <ArrowUpRight size={15} aria-hidden="true" /></Button>
      <IconButton icon={FilePenLine} label={`Edit ${workspace.name}`} disabled={busy} onClick={() => onEdit(workspace)} />
      {onToggle && <IconButton icon={Power} label={`${workspace.status === "active" ? "Disable" : "Enable"} ${workspace.name}`} disabled={busy} onClick={() => onToggle(workspace)} />}
    </div>
  </article>)}</div>;
}

function DomainBadge({ status }: { status: CustomDomain["status"] | CustomDomain["sslStatus"] }) {
  const tone = status === "active" || status === "verified" ? "published" : status === "disabled" || status === "error" ? "disabled" : "draft";
  return <span className={`admBadge admBadge-${tone}`}>{status.replaceAll("_", " ")}</span>;
}

function DnsInstructions({ verification }: { verification: DomainVerificationConfig }) {
  if (!verification.record) return <p className="admSetupNote masterDnsInstructions">DNS instructions are unavailable until the server verification target is configured.</p>;
  return <section className="masterDnsInstructions" aria-labelledby="dns-instructions-title">
    <div><h3 id="dns-instructions-title">DNS records</h3><p>Add these records at your DNS provider. Changes may take time to propagate.</p></div>
    <div className="masterDnsRecord" role="group" aria-label="Required DNS record">
      <span><small>Type</small><strong>{verification.record.type}</strong></span>
      <span><small>Host</small><code>{verification.record.host}</code></span>
      <span><small>Value</small><code>{verification.record.value}</code></span>
      <em>Required</em>
    </div>
    {verification.www && <div className="masterDnsRecord" role="group" aria-label="Optional www DNS record">
      <span><small>Type</small><strong>{verification.www.type}</strong></span>
      <span><small>Host</small><code>{verification.www.host}</code></span>
      <span><small>Value</small><code>{verification.www.value}</code></span>
      <em>Optional</em>
    </div>}
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
