"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, LogOut, Power, RefreshCw, ShieldCheck, X } from "lucide-react";
import { adminApi } from "@/lib/admin";
import { Dialog, EmptyState, IconButton, SectionHeading } from "./admin/AdminUI";
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

export function MasterDashboard({ email }: { email: string }) {
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>([]);
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inspect, setInspect] = useState<MasterWorkspace | null>(null);

  const apply = useCallback((data: Payload) => {
    setWorkspaces(data.workspaces);
    setDefaultWorkspaceId(data.defaultWorkspaceId);
  }, []);
  const load = useCallback(async () => apply(await adminApi<Payload>("/api/master/workspaces")), [apply]);

  useEffect(() => {
    let cancelled = false;
    adminApi<Payload>("/api/master/workspaces")
      .then(data => { if (!cancelled) apply(data); })
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

  function logout() {
    void adminApi("/api/auth/logout", { method: "POST" }).then(() => window.location.assign("/admin/login"));
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
        {loading ? <EmptyState title="Loading workspaces..." /> : <>
          <div className="admMetrics">
            <article className="admMetric"><div><span>Workspaces</span><strong>{workspaces.length}</strong></div></article>
            <article className="admMetric"><div><span>Pages</span><strong>{totals.pages}</strong></div></article>
            <article className="admMetric"><div><span>Admins</span><strong>{totals.admins}</strong></div></article>
            <article className="admMetric"><div><span>Subscribers</span><strong>{totals.subscribers}</strong></div></article>
          </div>

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
                <IconButton
                  icon={Power}
                  label={`${workspace.status === "active" ? "Disable" : "Enable"} ${workspace.name}`}
                  disabled={busy || workspace.id === defaultWorkspaceId}
                  onClick={() => void run(() => adminApi("/api/master/workspaces", { method: "PATCH", body: JSON.stringify({ id: workspace.id, status: workspace.status === "active" ? "disabled" : "active" }) }))}
                />
              </div>
            </article>)}
          </div>}
          <p className="admMuted">The main workspace cannot be disabled. Disabling a workspace signs out its owner and admins; public pages stay online.</p>
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
