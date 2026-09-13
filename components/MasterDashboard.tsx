"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Building2, LogOut, Power, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import type { PublicWorkspaceUser } from '@/lib/workspaceUsers';
import { adminApi } from "@/lib/admin";
import { defaultBranding, type BrandingSettings } from "@/lib/brandingConstants";
import { ImageUploader } from "./ImageUploader";
import { Dialog, EmptyState, Field, IconButton, SectionHeading } from "./admin/AdminUI";
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
const fallbackBranding: BrandingSettings = defaultBranding;
type SignupSettings = { enabled: boolean };

export function MasterDashboard({ email }: { email: string }) {
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>([]);
  const [users, setUsers] = useState<PublicWorkspaceUser[]>([]);
  const [branding, setBranding] = useState<BrandingSettings>(fallbackBranding);
  const [signup, setSignup] = useState<SignupSettings>({ enabled: true });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inspect, setInspect] = useState<MasterWorkspace | null>(null);

  const apply = useCallback((data: Payload) => {
    setWorkspaces(data.workspaces);
  }, []);
  const load = useCallback(async () => {
    const [data, accounts] = await Promise.all([adminApi<Payload>('/api/master/workspaces'), adminApi<PublicWorkspaceUser[]>('/api/master/users')]);
    apply(data); setUsers(accounts);
  }, [apply]);
  const loadBranding = useCallback(async () => setBranding(await adminApi<BrandingSettings>("/api/master/branding")), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([adminApi<Payload>("/api/master/workspaces"), adminApi<BrandingSettings>("/api/master/branding"), adminApi<SignupSettings>("/api/master/signup"), adminApi<PublicWorkspaceUser[]>('/api/master/users')])
      .then(([data, brand, signupSettings, accounts]) => { if (!cancelled) { apply(data); setBranding(brand); setSignup(signupSettings); setUsers(accounts); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load workspaces."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apply]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function saveBranding() {
    if (savingBranding) return;
    setSavingBranding(true);
    setError("");
    setMessage("");
    try {
      setBranding(await adminApi<BrandingSettings>("/api/master/branding", { method: "PATCH", body: JSON.stringify(branding) }));
      setMessage("Branding saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save branding.");
    } finally {
      setSavingBranding(false);
    }
  }

  async function updateBrandingImage(key: "logo" | "favicon", value: string) {
    const next = { ...branding, [key]: value || fallbackBranding[key] };
    setBranding(next);
    setSavingBranding(true);
    setError("");
    setMessage("");
    try {
      setBranding(await adminApi<BrandingSettings>("/api/master/branding", { method: "PATCH", body: JSON.stringify(next) }));
      setMessage("Branding saved.");
      await loadBranding();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save branding.");
    } finally {
      setSavingBranding(false);
    }
  }

  async function updateSignup(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setSignup(await adminApi<SignupSettings>("/api/master/signup", { method: "PATCH", body: JSON.stringify({ enabled }) }));
      setMessage(`Signup turned ${enabled ? "on" : "off"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update signup.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    void adminApi("/api/auth/logout", { method: "POST" }).then(() => window.location.assign("/admin/login"));
  }

  async function openWorkspace(workspaceId: string) {
    await adminApi('/api/master/context', { method: 'POST', body: JSON.stringify({ workspaceId }) });
    window.location.assign('/admin');
  }

  const totals = workspaces.reduce((sum, workspace) => ({
    pages: sum.pages + workspace.pages,
    admins: sum.admins + workspace.admins,
    subscribers: sum.subscribers + workspace.subscribers,
  }), { pages: 0, admins: 0, subscribers: 0 });

  return <div className="admShell admShellPlain">
    <div className="admWorkspace">
      <header className="admTopbar">
        <div className="admTopbarTitle"><div><span>Master admin</span><h1>All workspaces</h1></div></div>
        <div className="admHeaderActions">
          <span className="admBadge"><ShieldCheck size={13} />{email}</span>
          <IconButton icon={RefreshCw} label="Refresh workspaces" disabled={busy} onClick={() => void run(async () => {})} />
          <button type="button" className="admButton" onClick={logout}><LogOut size={16} />Log out</button>
        </div>
      </header>

      <main className="admMain" aria-busy={busy || loading}>
        {error && <div className="admError" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError("")} /></div>}
        {message && <p className="admSuccess" role="status">{message}</p>}
        {loading ? <EmptyState title="Loading workspaces..." /> : <>
          <div className="admMetrics">
            <article className="admMetric"><div><span>Workspaces</span><strong>{workspaces.length}</strong></div></article>
            <article className="admMetric"><div><span>Pages</span><strong>{totals.pages}</strong></div></article>
            <article className="admMetric"><div><span>Admins</span><strong>{totals.admins}</strong></div></article>
            <article className="admMetric"><div><span>Subscribers</span><strong>{totals.subscribers}</strong></div></article>
          </div>

          <SectionHeading title="Signup access" />
          <section className="admBrandingPanel">
            <div className="admSettingRow">
              <div>
                <span className={`admBadge admBadge-${signup.enabled ? "published" : "disabled"}`}><UserPlus size={13} />Signup {signup.enabled ? "on" : "off"}</span>
                <h2>Public account creation</h2>
                <p className="admMuted">Turn signup off to block the create-account page and prevent new accounts from being created.</p>
              </div>
              <button type="button" className="admButton admPrimary" disabled={busy} onClick={() => void updateSignup(!signup.enabled)}>
                <Power size={16} />Turn {signup.enabled ? "off" : "on"}
              </button>
            </div>
          </section>

          <SectionHeading title="Branding" />
          <section className="admBrandingPanel">
            <div className="admFormGrid">
              <Field label="Brand name"><input maxLength={80} value={branding.name} onChange={event => setBranding({ ...branding, name: event.target.value })} /></Field>
              <Field label="Site title"><input maxLength={140} value={branding.siteTitle} onChange={event => setBranding({ ...branding, siteTitle: event.target.value })} /></Field>
              <div className="admSpanFull">
                <label className="admSwitchRow">
                  <span>
                    <strong>Allow public signup</strong>
                    <small>{branding.signupEnabled ? "New users can see Sign Up and create their own workspace." : "Sign Up is hidden and new account creation is blocked."}</small>
                  </span>
                  <input type="checkbox" checked={branding.signupEnabled} onChange={event => setBranding({ ...branding, signupEnabled: event.target.checked })} />
                </label>
              </div>
              <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="logo" label="Master logo" round value={branding.logo} onChange={logo => void updateBrandingImage("logo", logo)} /></div>
              <div className="admSpanFull"><ImageUploader endpoint="/api/master/branding/upload" category="favicon" label="Master favicon" value={branding.favicon} onChange={favicon => void updateBrandingImage("favicon", favicon)} /></div>
            </div>
            <div className="admFormFooter">
              <button type="button" className="admButton admPrimary" disabled={savingBranding} onClick={() => void saveBranding()}>{savingBranding ? "Saving..." : "Save branding"}</button>
            </div>
          </section>

          <SectionHeading title="Workspaces" />
          {!workspaces.length ? <EmptyState title="No workspaces yet" /> : <div className="admMasterList">
            {workspaces.map(workspace => <article key={workspace.id} className="admMasterRow">
              <button type="button" className="admMasterName" onClick={() => setInspect(workspace)}>
                <Building2 size={18} aria-hidden="true" />
                <span><strong>{workspace.name}</strong><small>{workspace.ownerEmail}</small></span>
              </button>
              <span className={`admBadge admBadge-${workspace.status === "active" ? "published" : "disabled"}`}>{workspace.status}</span>
              <span className="admMasterCount"><small>Pages</small><strong>{workspace.pages}</strong></span>
              <span className="admMasterCount"><small>Admins</small><strong>{workspace.admins}</strong></span>
              <span className="admMasterCount"><small>Subscribers</small><strong>{workspace.subscribers}</strong></span>
              <span className="admMasterCount"><small>Created</small><strong>{workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "—"}</strong></span>
              <div className="admActionRow">
                <IconButton icon={ArrowUpRight} label={`Manage ${workspace.name}`} disabled={busy} onClick={() => void run(() => openWorkspace(workspace.id))} />
                <IconButton
                  icon={Power}
                  label={`${workspace.status === "active" ? "Disable" : "Enable"} ${workspace.name}`}
                  disabled={busy}
                  onClick={() => void run(() => adminApi("/api/master/workspaces", { method: "PATCH", body: JSON.stringify({ id: workspace.id, status: workspace.status === "active" ? "disabled" : "active" }) }))}
                />
              </div>
            </article>)}
          </div>}
          <SectionHeading title="All accounts" />
          <div className="admTeamList">{users.map(user => <article className="admTeamRow" key={user.id}>
            <ShieldCheck size={20} /><div><strong>{user.name}</strong><small>{user.email}</small></div>
            <span className="admBadge">{user.role === 'owner' ? 'Admin / Owner' : user.role}</span>
            <span>{workspaces.find(workspace => workspace.id === user.workspaceId)?.name || user.workspaceId}</span>
            <span className="admBadge">{user.pending ? 'Invited' : user.active ? 'Active' : 'Disabled'}</span>
            <IconButton icon={ArrowUpRight} label={`Manage team for ${user.email}`} onClick={() => void run(() => openWorkspace(user.workspaceId))} />
          </article>)}</div>
        </>}
      </main>
    </div>

    {inspect && <Dialog title={inspect.name} onClose={() => setInspect(null)}>
      <dl className="admMasterDetail">
        <div><dt>Workspace ID</dt><dd>{inspect.id}</dd></div>
        <div><dt>Owner</dt><dd>{inspect.ownerName}</dd></div>
        <div><dt>Owner email</dt><dd>{inspect.ownerEmail}</dd></div>
        <div><dt>Status</dt><dd>{inspect.status}</dd></div>
        <div><dt>Created</dt><dd>{inspect.createdAt ? new Date(inspect.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt>Pages</dt><dd>{inspect.pages}</dd></div>
        <div><dt>Admins</dt><dd>{inspect.admins}</dd></div>
        <div><dt>Subscribers</dt><dd>{inspect.subscribers}</dd></div>
      </dl>
    </Dialog>}
  </div>;
}
