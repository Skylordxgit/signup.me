"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Copy,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plus,
  Power,
  RefreshCw,
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
        {error && !userModal && <div className="admError masterNotice" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError("")} /></div>}
        {message && <p className="admSuccess masterNotice" role="status">{message}</p>}
        {inviteUrl && <div className="admCard admFormStack masterNotice"><Field label="Invitation link" hint="Single-use link for the invited user."><input readOnly value={inviteUrl} onFocus={event => event.target.select()} /></Field><Button icon={Copy} onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage("Link copied to clipboard.")).catch(() => setError("Could not copy link."))}>Copy invitation link</Button></div>}
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
            <div className="masterPageIntro">
              <div><span>{users.length} accounts</span><h2>All registered users</h2><p>Create, manage, and inspect all user and administrator accounts across all workspaces.</p></div>
              <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateUserModal}>Add user / admin</Button>
            </div>
            <section className="masterPanel">
              {!users.length ? <EmptyState title="No registered users found" /> : <div className="masterUserList">{users.map(user => <article key={user.id}>
                <span className="masterUserAvatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
                <div className="masterUserName"><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></div>
                <div><small>Workspace</small><strong>{workspaces.find(workspace => workspace.id === user.workspaceId)?.name || user.workspaceId}</strong></div>
                <span className="admBadge">{user.role === "owner" ? "Admin / Owner" : "Member"}</span>
                <span className={`admBadge admBadge-${user.pending ? "" : user.active ? "published" : "disabled"}`}>{user.pending ? "Invited" : user.active ? "Active" : "Disabled"}</span>
                <div className="admActionRow">
                  <IconButton icon={Settings2} label={`Permissions for ${user.email}`} disabled={busy} onClick={() => openEditUserModal(user, "permissions")} />
                  {!user.pending && <IconButton icon={KeyRound} label={`Reset password for ${user.email}`} disabled={busy} onClick={() => openEditUserModal(user, "password")} />}
                  <IconButton icon={user.active ? UserX : UserCheck} label={`${user.active ? "Disable" : "Enable"} ${user.email}`} disabled={busy} onClick={() => void run(() => adminApi("/api/master/users", { method: "PATCH", body: JSON.stringify({ id: user.id, action: "access", active: !user.active }) }))} />
                  <IconButton icon={Trash2} tone="danger" label={`Delete ${user.email}`} disabled={busy} onClick={() => void run(() => adminApi("/api/master/users", { method: "DELETE", body: JSON.stringify({ id: user.id }) }))} />
                  <IconButton icon={ArrowUpRight} label={`Open workspace for ${user.email}`} onClick={() => void run(() => openWorkspace(user.workspaceId))} />
                </div>
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
