"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  FilePenLine,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Plus,
  Power,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useMasterAdmin, type MasterWorkspace } from "./MasterAdminContext";
import { Button, EmptyState, Field, IconButton, SectionHeading } from "./AdminUI";
import { ImageUploader } from "../ImageUploader";
import type { CustomDomain } from "@/lib/domains";
import { formatDate } from "@/lib/utils";
import { number } from "@/lib/admin";

export function DomainBadge({ status }: { status: string | null }) {
  if (status === "active") return <span className="admBadge admBadge-published">Active</span>;
  if (status === "disabled") return <span className="admBadge admBadge-disabled">Disabled</span>;
  if (status === "error") return <span className="admBadge admBadge-disabled">Error</span>;
  if (status === "verified") return <span className="admBadge">DNS Verified</span>;
  if (status === "ssl_pending") return <span className="admBadge">SSL Pending</span>;
  return <span className="admBadge">Pending</span>;
}

export function WorkspaceList({
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
  onCreate: () => void;
}) {
  if (!workspaces.length) {
    return (
      <EmptyState
        icon={Building2}
        title="No workspaces created yet"
        description="Create an isolated workspace for a client or project."
      >
        <Button variant="primary" icon={Plus} onClick={onCreate}>
          Create workspace
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="masterWorkspaceList">
      {workspaces.map(workspace => (
        <article key={workspace.id} className={workspace.status === "disabled" ? "masterWorkspaceDisabled" : ""}>
          <div className="masterWorkspaceMain">
            <button
              type="button"
              className="masterWorkspaceTitle"
              onClick={() => onInspect(workspace)}
            >
              <strong>{workspace.name}</strong>
              <small>{workspace.ownerEmail || "No owner specified"}</small>
            </button>
            <div className="masterWorkspaceStats">
              <span>
                <small>Pages</small>
                <strong>{workspace.pages}</strong>
              </span>
              <span>
                <small>Admins</small>
                <strong>{workspace.admins}</strong>
              </span>
              <span>
                <small>Subscribers</small>
                <strong>{workspace.subscribers}</strong>
              </span>
            </div>
          </div>
          <div className="masterWorkspaceMeta">
            <div className="masterWorkspaceTags">
              <span className={`admBadge admBadge-${workspace.status === "active" ? "published" : "disabled"}`}>
                {workspace.status === "active" ? "Active" : "Disabled"}
              </span>
              {workspace.domain && (
                <span className="masterDomainTag">
                  <Globe2 size={12} />
                  {workspace.domain}
                </span>
              )}
            </div>
            <div className="admActionRow">
              <Button
                size="sm"
                variant="primary"
                icon={ArrowUpRight}
                disabled={busy || workspace.status === "disabled"}
                onClick={() => onOpen(workspace)}
              >
                Open workspace
              </Button>
              <IconButton
                icon={FilePenLine}
                label={`Edit ${workspace.name}`}
                disabled={busy}
                onClick={() => onEdit(workspace)}
              />
              {onToggle && (
                <IconButton
                  icon={Power}
                  label={`${workspace.status === "active" ? "Disable" : "Enable"} ${workspace.name}`}
                  disabled={busy}
                  onClick={() => onToggle(workspace)}
                />
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MasterOverviewView() {
  const {
    workspaces,
    users,
    busy,
    openCreateWorkspaceModal,
    openEditWorkspaceModal,
    setInspect,
    run,
    openWorkspace,
  } = useMasterAdmin();

  const totals = workspaces.reduce(
    (sum, workspace) => ({
      pages: sum.pages + workspace.pages,
      admins: sum.admins + workspace.admins,
      subscribers: sum.subscribers + workspace.subscribers,
    }),
    { pages: 0, admins: 0, subscribers: 0 }
  );
  const activeWorkspaces = workspaces.filter(workspace => workspace.status === "active").length;

  return (
    <div className="masterView">
      <section className="masterHero">
        <div>
          <span className="masterEyebrow">
            <ShieldCheck size={14} />
            Global platform access
          </span>
          <h2>Everything important, at a glance.</h2>
          <p>Monitor workspaces, accounts, pages and notification reach from one secure control center.</p>
        </div>
        <div className="admActionRow">
          <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>
            Create workspace
          </Button>
          <Link href="/admin/master/workspaces">
            <Button variant="secondary">Manage workspaces</Button>
          </Link>
        </div>
      </section>

      <div className="masterMetrics">
        <article>
          <span className="masterMetricIcon masterToneBlue">
            <Building2 size={20} />
          </span>
          <div>
            <small>Workspaces</small>
            <strong>{workspaces.length}</strong>
            <em>{activeWorkspaces} active</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneViolet">
            <Users size={20} />
          </span>
          <div>
            <small>User accounts</small>
            <strong>{users.length}</strong>
            <em>{totals.admins} admins</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneAmber">
            <LayoutDashboard size={20} />
          </span>
          <div>
            <small>Published assets</small>
            <strong>{totals.pages}</strong>
            <em>pages platform-wide</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneGreen">
            <Globe2 size={20} />
          </span>
          <div>
            <small>Push audience</small>
            <strong>{totals.subscribers}</strong>
            <em>subscribers</em>
          </div>
        </article>
      </div>

      <section className="masterPanel">
        <SectionHeading title="Recent workspaces">
          <div className="admActionRow">
            <Button size="sm" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>
              New workspace
            </Button>
            <Link href="/admin/master/workspaces" className="masterTextButton">
              View all <ArrowRight size={14} />
            </Link>
          </div>
        </SectionHeading>
        <WorkspaceList
          workspaces={workspaces.slice(0, 5)}
          busy={busy}
          onInspect={setInspect}
          onOpen={workspace => void run(() => openWorkspace(workspace))}
          onEdit={openEditWorkspaceModal}
          onCreate={openCreateWorkspaceModal}
        />
      </section>
    </div>
  );
}

export function MasterWorkspacesView() {
  const {
    workspaces,
    busy,
    openCreateWorkspaceModal,
    openEditWorkspaceModal,
    setInspect,
    run,
    openWorkspace,
  } = useMasterAdmin();

  return (
    <div className="masterView">
      <div className="masterPageIntro">
        <div>
          <span>{workspaces.length} total</span>
          <h2>Workspace management</h2>
          <p>Inspect, enter, enable or disable every tenant from one place.</p>
        </div>
        <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateWorkspaceModal}>
          Create workspace
        </Button>
      </div>
      <section className="masterPanel">
        <WorkspaceList
          workspaces={workspaces}
          busy={busy}
          onInspect={setInspect}
          onOpen={workspace => void run(() => openWorkspace(workspace))}
          onEdit={openEditWorkspaceModal}
          onToggle={workspace =>
            void run(async () => {
              const { adminApi } = await import("@/lib/admin");
              await adminApi("/api/master/workspaces", {
                method: "PATCH",
                body: JSON.stringify({
                  id: workspace.id,
                  status: workspace.status === "active" ? "disabled" : "active",
                }),
              });
            })
          }
          onCreate={openCreateWorkspaceModal}
        />
      </section>
    </div>
  );
}

export function MasterDomainsView() {
  const {
    domains,
    workspaces,
    verification,
    busy,
    openDomainModal,
    setDomainDetail,
    run,
  } = useMasterAdmin();

  return (
    <div className="masterView">
      <div className="masterPageIntro">
        <div>
          <span>{domains.length} configured</span>
          <h2>Custom domains</h2>
          <p>Connect branded hostnames, verify DNS, and control workspace routing.</p>
        </div>
        <Button variant="primary" icon={Plus} disabled={busy} onClick={() => openDomainModal("add")}>
          Add domain
        </Button>
      </div>
      <div className="masterMetrics masterDomainMetrics">
        <article>
          <span className="masterMetricIcon masterToneBlue">
            <Globe2 size={20} />
          </span>
          <div>
            <small>Total domains</small>
            <strong>{domains.length}</strong>
            <em>platform-wide</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneGreen">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <small>Active</small>
            <strong>{domains.filter(domain => domain.status === "active").length}</strong>
            <em>DNS and SSL ready</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneAmber">
            <ShieldAlert size={20} />
          </span>
          <div>
            <small>Needs attention</small>
            <strong>{domains.filter(domain => !["active", "disabled"].includes(domain.status)).length}</strong>
            <em>pending or errored</em>
          </div>
        </article>
        <article>
          <span className="masterMetricIcon masterToneViolet">
            <Building2 size={20} />
          </span>
          <div>
            <small>Assigned</small>
            <strong>{domains.filter(domain => domain.workspaceId).length}</strong>
            <em>{domains.filter(domain => !domain.workspaceId).length} available</em>
          </div>
        </article>
      </div>

      {!verification.configured && (
        <p className="admSetupNote masterNotice" role="status">
          DNS verification is not configured. Set <code>CUSTOM_DOMAIN_CNAME_TARGET</code> or <code>CUSTOM_DOMAIN_SERVER_IP</code> on the server.
        </p>
      )}

      <section className="masterPanel masterDomainPanel">
        {!domains.length ? (
          <EmptyState icon={Globe2} title="No custom domains" description="Add a hostname to see the DNS records needed to connect it.">
            <Button variant="primary" icon={Plus} onClick={() => openDomainModal("add")}>
              Add domain
            </Button>
          </EmptyState>
        ) : (
          <div className="masterDomainList">
            {domains.map(domain => {
              const workspace = workspaces.find(item => item.id === domain.workspaceId);
              return (
                <article key={domain.id}>
                  <button
                    type="button"
                    className="masterDomainIdentity"
                    onClick={() => setDomainDetail(domain)}
                  >
                    <span>
                      <Globe2 size={19} />
                    </span>
                    <div>
                      <strong>{domain.hostname}</strong>
                      <small>Added {formatDate(domain.createdAt)}</small>
                    </div>
                  </button>
                  <div className="masterDomainStatus">
                    <small>Verification</small>
                    <DomainBadge status={domain.status} />
                  </div>
                  <div className="masterDomainStatus">
                    <small>SSL</small>
                    <DomainBadge status={domain.sslStatus} />
                  </div>
                  <div className="masterDomainWorkspace">
                    <small>Workspace</small>
                    <strong>{workspace?.name || "Unassigned"}</strong>
                  </div>
                  <div className="masterDomainActions">
                    <Button
                      size="sm"
                      icon={RefreshCw}
                      disabled={busy || !verification.configured || domain.status === "disabled"}
                      onClick={() =>
                        void run(async () => {
                          const { adminApi } = await import("@/lib/admin");
                          const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", {
                            method: "PATCH",
                            body: JSON.stringify({ id: domain.id, action: "verify" }),
                          });
                          setDomainDetail(result.domain);
                        })
                      }
                    >
                      Verify
                    </Button>
                    {domain.lastVerifiedAt && domain.sslStatus !== "active" && (
                      <Button
                        size="sm"
                        icon={ShieldCheck}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const { adminApi } = await import("@/lib/admin");
                            await adminApi("/api/master/domains", {
                              method: "PATCH",
                              body: JSON.stringify({ id: domain.id, action: "ssl", sslStatus: "active" }),
                            });
                          })
                        }
                      >
                        Activate SSL
                      </Button>
                    )}
                    <Button
                      size="sm"
                      icon={Building2}
                      disabled={busy}
                      onClick={() => openDomainModal({ action: "assign", domain })}
                    >
                      {domain.workspaceId ? "Change workspace" : "Assign workspace"}
                    </Button>
                    {domain.workspaceId && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const { adminApi } = await import("@/lib/admin");
                            await adminApi("/api/master/domains", {
                              method: "PATCH",
                              body: JSON.stringify({ id: domain.id, action: "assign", workspaceId: null }),
                            });
                          })
                        }
                      >
                        Unassign
                      </Button>
                    )}
                    <IconButton
                      icon={FilePenLine}
                      label={`Edit ${domain.hostname}`}
                      disabled={busy}
                      onClick={() => openDomainModal({ action: "edit", domain })}
                    />
                    <IconButton
                      icon={Power}
                      label={`${domain.status === "disabled" ? "Enable" : "Disable"} ${domain.hostname}`}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const { adminApi } = await import("@/lib/admin");
                          await adminApi("/api/master/domains", {
                            method: "PATCH",
                            body: JSON.stringify({
                              id: domain.id,
                              action: "disable",
                              disabled: domain.status !== "disabled",
                            }),
                          });
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label={`Delete ${domain.hostname}`}
                      disabled={busy}
                      onClick={() => openDomainModal({ action: "delete", domain })}
                    />
                  </div>
                  {domain.verificationError && (
                    <p className="masterDomainError" role="status">
                      {domain.verificationError}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function MasterUsersView() {
  const {
    users,
    workspaces,
    busy,
    openCreateUserModal,
    openEditUserModal,
    run,
    openWorkspace,
  } = useMasterAdmin();

  return (
    <div className="masterView">
      <div className="masterPageIntro">
        <div>
          <span>{users.length} accounts</span>
          <h2>All registered users</h2>
          <p>Create, manage, and inspect all user and administrator accounts across all workspaces.</p>
        </div>
        <Button variant="primary" icon={Plus} disabled={busy} onClick={openCreateUserModal}>
          Add user / admin
        </Button>
      </div>
      <section className="masterPanel">
        {!users.length ? (
          <EmptyState title="No registered users found" />
        ) : (
          <div className="masterUserList">
            {users.map(user => (
              <article key={user.id}>
                <span className="masterUserAvatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
                <div className="masterUserName">
                  <strong>{user.name || "Unnamed user"}</strong>
                  <small>{user.email}</small>
                </div>
                <div>
                  <small>Workspace</small>
                  <strong>{workspaces.find(workspace => workspace.id === user.workspaceId)?.name || user.workspaceId}</strong>
                </div>
                <span className="admBadge">{user.role === "owner" ? "Admin / Owner" : "Member"}</span>
                <span className={`admBadge admBadge-${user.pending ? "" : user.active ? "published" : "disabled"}`}>
                  {user.pending ? "Invited" : user.active ? "Active" : "Disabled"}
                </span>
                <div className="admActionRow">
                  <IconButton
                    icon={Settings2}
                    label={`Permissions for ${user.email}`}
                    disabled={busy}
                    onClick={() => openEditUserModal(user, "permissions")}
                  />
                  {!user.pending && (
                    <IconButton
                      icon={KeyRound}
                      label={`Reset password for ${user.email}`}
                      disabled={busy}
                      onClick={() => openEditUserModal(user, "password")}
                    />
                  )}
                  <IconButton
                    icon={user.active ? UserX : UserCheck}
                    label={`${user.active ? "Disable" : "Enable"} ${user.email}`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { adminApi } = await import("@/lib/admin");
                        await adminApi("/api/master/users", {
                          method: "PATCH",
                          body: JSON.stringify({ id: user.id, action: "access", active: !user.active }),
                        });
                      })
                    }
                  />
                  <IconButton
                    icon={Trash2}
                    tone="danger"
                    label={`Delete ${user.email}`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { adminApi } = await import("@/lib/admin");
                        await adminApi("/api/master/users", {
                          method: "DELETE",
                          body: JSON.stringify({ id: user.id }),
                        });
                      })
                    }
                  />
                  <IconButton
                    icon={ArrowUpRight}
                    label={`Open workspace for ${user.email}`}
                    onClick={() => {
                      const workspace = workspaces.find(item => item.id === user.workspaceId);
                      if (workspace) void run(() => openWorkspace(workspace));
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function MasterBrandingView() {
  const { branding, setBranding, savingBranding, saveBranding, updateBrandingImage } = useMasterAdmin();

  return (
    <div className="masterView">
      <div className="masterPageIntro">
        <div>
          <span>Platform identity</span>
          <h2>Global branding</h2>
          <p>Update the identity shown across authentication and administration screens.</p>
        </div>
      </div>
      <section className="masterPanel masterBrandingLayout">
        <div className="masterBrandPreview">
          <span>Live preview</span>
          <div>
            <Image src={branding.logo} alt="" width={58} height={58} unoptimized />
            <strong>{branding.name}</strong>
          </div>
          <p>{branding.siteTitle}</p>
        </div>
        <div className="masterBrandForm">
          <div className="admFormGrid">
            <Field label="Brand name">
              <input
                maxLength={80}
                value={branding.name}
                onChange={event => setBranding({ ...branding, name: event.target.value })}
              />
            </Field>
            <Field label="Site title">
              <input
                maxLength={140}
                value={branding.siteTitle}
                onChange={event => setBranding({ ...branding, siteTitle: event.target.value })}
              />
            </Field>
            <div className="admSpanFull">
              <ImageUploader
                endpoint="/api/master/branding/upload"
                category="logo"
                label="Platform logo"
                round
                value={branding.logo}
                onChange={logo => void updateBrandingImage("logo", logo)}
              />
            </div>
            <div className="admSpanFull">
              <ImageUploader
                endpoint="/api/master/branding/upload"
                category="favicon"
                label="Browser favicon"
                value={branding.favicon}
                onChange={favicon => void updateBrandingImage("favicon", favicon)}
              />
            </div>
          </div>
          <div className="admFormFooter">
            <Button variant="primary" loading={savingBranding} onClick={() => void saveBranding()}>
              Save global branding
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MasterSignupView() {
  const { signup, busy, updateSignup } = useMasterAdmin();

  return (
    <div className="masterView">
      <div className="masterPageIntro">
        <div>
          <span>Platform access</span>
          <h2>Public signup</h2>
          <p>Control whether new people can create independent workspaces.</p>
        </div>
      </div>
      <section className={`masterAccessCard ${signup.enabled ? "masterAccessOn" : "masterAccessOff"}`}>
        <span className="masterAccessIcon">
          <UserPlus size={26} />
        </span>
        <div>
          <span className="masterEyebrow">Current status</span>
          <h2>Public signup is {signup.enabled ? "open" : "closed"}</h2>
          <p>
            {signup.enabled
              ? "New users can register and receive a clean, isolated workspace."
              : "New registrations are blocked. Existing users can still sign in normally."}
          </p>
        </div>
        <Button variant="primary" icon={Power} disabled={busy} onClick={() => void updateSignup(!signup.enabled)}>
          Turn signup {signup.enabled ? "off" : "on"}
        </Button>
      </section>
    </div>
  );
}
