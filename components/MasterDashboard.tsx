"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Power,
  RefreshCw,
  ShieldCheck,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import type { PublicWorkspaceUser } from "@/lib/workspaceUsers";
import { adminApi } from "@/lib/admin";
import { defaultBranding, type BrandingSettings } from "@/lib/brandingConstants";
import { ImageUploader } from "./ImageUploader";
import { Button, Dialog, EmptyState, Field, IconButton, LoadingState, SectionHeading } from "./admin/AdminUI";
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
};

type Payload = { workspaces: MasterWorkspace[]; defaultWorkspaceId: string };
type SignupSettings = { enabled: boolean };
type MasterView = "overview" | "workspaces" | "users" | "branding" | "signup";

const views = [
  { id: "overview", label: "Overview", description: "Platform health", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", description: "Manage every workspace", icon: Building2 },
  { id: "users", label: "All users", description: "Accounts and access", icon: Users },
  { id: "branding", label: "Global branding", description: "Identity and assets", icon: Palette },
  { id: "signup", label: "Signup access", description: "Registration control", icon: UserPlus },
] as const;

export function MasterDashboard({ email }: { email: string }) {
  const [view, setView] = useState<MasterView>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>([]);
  const [users, setUsers] = useState<PublicWorkspaceUser[]>([]);
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [signup, setSignup] = useState<SignupSettings>({ enabled: true });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState<MasterWorkspace | null>(null);

  const load = useCallback(async () => {
    const [data, brand, signupSettings, accounts] = await Promise.all([
      adminApi<Payload>("/api/master/workspaces"),
      adminApi<BrandingSettings>("/api/master/branding"),
      adminApi<SignupSettings>("/api/master/signup"),
      adminApi<PublicWorkspaceUser[]>("/api/master/users"),
    ]);
    setWorkspaces(data.workspaces);
    setBranding(brand);
    setSignup(signupSettings);
    setUsers(accounts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      adminApi<Payload>("/api/master/workspaces"),
      adminApi<BrandingSettings>("/api/master/branding"),
      adminApi<SignupSettings>("/api/master/signup"),
      adminApi<PublicWorkspaceUser[]>("/api/master/users"),
    ])
      .then(([data, brand, signupSettings, accounts]) => {
        if (cancelled) return;
        setWorkspaces(data.workspaces);
        setBranding(brand);
        setSignup(signupSettings);
        setUsers(accounts);
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load platform data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
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
  }

  function logout() {
    void adminApi("/api/auth/logout", { method: "POST" }).then(() => window.location.assign("/admin/login"));
  }

  async function openWorkspace(workspaceId: string) {
    await adminApi("/api/master/context", { method: "POST", body: JSON.stringify({ workspaceId }) });
    window.location.assign("/admin");
  }

  const totals = workspaces.reduce((sum, workspace) => ({
    pages: sum.pages + workspace.pages,
    admins: sum.admins + workspace.admins,
    subscribers: sum.subscribers + workspace.subscribers,
  }), { pages: 0, admins: 0, subscribers: 0 });
  const activeWorkspaces = workspaces.filter(workspace => workspace.status === "active").length;
  const selected = views.find(item => item.id === view) ?? views[0];

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
        {views.map(item => <button
          type="button"
          key={item.id}
          className={view === item.id ? "masterNavActive" : ""}
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => navigate(item.id)}
        >
          <item.icon size={18} />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
          <ArrowRight size={14} />
        </button>)}
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
        {error && <div className="admError masterNotice" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError("")} /></div>}
        {message && <p className="admSuccess masterNotice" role="status">{message}</p>}
        {loading ? <LoadingState label="Loading your control center..." /> : <>
          {view === "overview" && <div className="masterView">
            <section className="masterHero">
              <div><span className="masterEyebrow"><ShieldCheck size={14} />Global platform access</span><h2>Everything important, at a glance.</h2><p>Monitor workspaces, accounts, pages and notification reach from one secure control center.</p></div>
              <button type="button" onClick={() => navigate("workspaces")}>Manage workspaces <ArrowRight size={16} /></button>
            </section>
            <div className="masterMetrics">
              <article><span className="masterMetricIcon masterToneBlue"><Building2 size={20} /></span><div><small>Workspaces</small><strong>{workspaces.length}</strong><em>{activeWorkspaces} active</em></div></article>
              <article><span className="masterMetricIcon masterToneViolet"><Users size={20} /></span><div><small>User accounts</small><strong>{users.length}</strong><em>{totals.admins} admins</em></div></article>
              <article><span className="masterMetricIcon masterToneAmber"><LayoutDashboard size={20} /></span><div><small>Published assets</small><strong>{totals.pages}</strong><em>pages platform-wide</em></div></article>
              <article><span className="masterMetricIcon masterToneGreen"><Globe2 size={20} /></span><div><small>Push audience</small><strong>{totals.subscribers}</strong><em>subscribers</em></div></article>
            </div>
            <section className="masterPanel">
              <SectionHeading title="Recent workspaces"><button type="button" className="masterTextButton" onClick={() => navigate("workspaces")}>View all <ArrowRight size={14} /></button></SectionHeading>
              <WorkspaceList workspaces={workspaces.slice(0, 5)} busy={busy} onInspect={setInspect} onOpen={workspace => void run(() => openWorkspace(workspace.id))} />
            </section>
          </div>}

          {view === "workspaces" && <div className="masterView">
            <div className="masterPageIntro"><div><span>{workspaces.length} total</span><h2>Workspace management</h2><p>Inspect, enter, enable or disable every tenant from one place.</p></div></div>
            <section className="masterPanel"><WorkspaceList workspaces={workspaces} busy={busy} onInspect={setInspect} onOpen={workspace => void run(() => openWorkspace(workspace.id))} onToggle={workspace => void run(() => adminApi("/api/master/workspaces", { method: "PATCH", body: JSON.stringify({ id: workspace.id, status: workspace.status === "active" ? "disabled" : "active" }) }))} /></section>
          </div>}

          {view === "users" && <div className="masterView">
            <div className="masterPageIntro"><div><span>{users.length} accounts</span><h2>All registered users</h2><p>See each user’s role, workspace and current account status.</p></div></div>
            <section className="masterPanel">
              {!users.length ? <EmptyState title="No registered users found" /> : <div className="masterUserList">{users.map(user => <article key={user.id}>
                <span className="masterUserAvatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
                <div className="masterUserName"><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></div>
                <div><small>Workspace</small><strong>{workspaces.find(workspace => workspace.id === user.workspaceId)?.name || user.workspaceId}</strong></div>
                <span className="admBadge">{user.role === "owner" ? "Admin / Owner" : "Member"}</span>
                <span className={`admBadge admBadge-${user.pending ? "" : user.active ? "published" : "disabled"}`}>{user.pending ? "Invited" : user.active ? "Active" : "Disabled"}</span>
                <IconButton icon={ArrowUpRight} label={`Manage workspace for ${user.email}`} onClick={() => void run(() => openWorkspace(user.workspaceId))} />
              </article>)}</div>}
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
      </dl>
    </Dialog>}
  </div>;
}

function WorkspaceList({
  workspaces,
  busy,
  onInspect,
  onOpen,
  onToggle,
}: {
  workspaces: MasterWorkspace[];
  busy: boolean;
  onInspect: (workspace: MasterWorkspace) => void;
  onOpen: (workspace: MasterWorkspace) => void;
  onToggle?: (workspace: MasterWorkspace) => void;
}) {
  if (!workspaces.length) return <EmptyState title="No workspaces yet" />;
  return <div className="masterWorkspaceList">{workspaces.map(workspace => <article key={workspace.id}>
    <button type="button" className="masterWorkspaceIdentity" onClick={() => onInspect(workspace)}>
      <span><Building2 size={19} /></span>
      <div><strong>{workspace.name}</strong><small>{workspace.ownerEmail}</small></div>
    </button>
    <span className={`admBadge admBadge-${workspace.status === "active" ? "published" : "disabled"}`}>{workspace.status}</span>
    <div className="masterWorkspaceStats"><span><small>Pages</small><strong>{workspace.pages}</strong></span><span><small>Admins</small><strong>{workspace.admins}</strong></span><span><small>Subscribers</small><strong>{workspace.subscribers}</strong></span></div>
    <div className="masterWorkspaceActions">
      <Button size="sm" disabled={busy} onClick={() => onOpen(workspace)}>Open <ArrowUpRight size={15} aria-hidden="true" /></Button>
      {onToggle && <IconButton icon={Power} label={`${workspace.status === "active" ? "Disable" : "Enable"} ${workspace.name}`} disabled={busy} onClick={() => onToggle(workspace)} />}
    </div>
  </article>)}</div>;
}
