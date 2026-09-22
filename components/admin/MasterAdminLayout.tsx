"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Copy,
  FilePenLine,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  MasterAdminProvider,
  useMasterAdmin,
  type MasterWorkspace,
} from "./MasterAdminContext";
import { Button, Dialog, Field, IconButton, LoadingState } from "./AdminUI";
import { workspacePermissions, type WorkspaceRole } from "@/lib/permissions";
import type { CustomDomain, DomainVerificationConfig } from "@/lib/domains";
import { formatDate } from "@/lib/utils";
import "./admin.css";

export const masterNavItems = [
  { href: "/admin/master", label: "Overview", description: "Platform health", icon: LayoutDashboard, exact: true },
  { href: "/admin/master/workspaces", label: "Workspaces", description: "Manage every workspace", icon: Building2 },
  { href: "/admin/master/domains", label: "Domains", description: "DNS and workspace routing", icon: Globe2 },
  { href: "/admin/master/users", label: "All users", description: "Accounts and access", icon: Users },
  { href: "/admin/master/branding", label: "Global branding", description: "Identity and assets", icon: Palette },
  { href: "/admin/master/signup", label: "Signup access", description: "Registration control", icon: UserPlus },
] as const;

function isNavActive(item: typeof masterNavItems[number], currentPath: string): boolean {
  if (item.exact) {
    return currentPath === "/admin/master" || currentPath === "/admin/master/overview";
  }
  return currentPath.startsWith(item.href);
}

function DnsInstructions({ verification }: { verification: DomainVerificationConfig }) {
  if (!verification.record) {
    return (
      <p className="admSetupNote masterDnsInstructions">
        DNS instructions are unavailable until the server verification target is configured.
      </p>
    );
  }
  return (
    <section className="masterDnsInstructions" aria-labelledby="dns-instructions-title">
      <div>
        <h3 id="dns-instructions-title">DNS records</h3>
        <p>Add these records at your DNS provider. Changes may take time to propagate.</p>
      </div>
      <div className="masterDnsRecord" role="group" aria-label="Required DNS record">
        <span>
          <small>Type</small>
          <strong>{verification.record.type}</strong>
        </span>
        <span>
          <small>Host</small>
          <code>{verification.record.host}</code>
        </span>
        <span>
          <small>Value</small>
          <code>{verification.record.value}</code>
        </span>
        <em>Required</em>
      </div>
      {verification.www && (
        <div className="masterDnsRecord" role="group" aria-label="Optional www DNS record">
          <span>
            <small>Type</small>
            <strong>{verification.www.type}</strong>
          </span>
          <span>
            <small>Host</small>
            <code>{verification.www.host}</code>
          </span>
          <span>
            <small>Value</small>
            <code>{verification.www.value}</code>
          </span>
          <em>Optional</em>
        </div>
      )}
    </section>
  );
}

function DomainBadge({ status }: { status: CustomDomain["status"] | CustomDomain["sslStatus"] }) {
  const tone =
    status === "active" || status === "verified"
      ? "published"
      : status === "disabled" || status === "error"
      ? "disabled"
      : "draft";
  return <span className={`admBadge admBadge-${tone}`}>{status.replaceAll("_", " ")}</span>;
}

function MasterAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin/master";
  const {
    email,
    branding,
    menuOpen,
    setMenuOpen,
    loading,
    busy,
    error,
    setError,
    message,
    setMessage,
    inviteUrl,
    refresh,
    logout,
    inspect,
    setInspect,
    openEditWorkspaceModal,
    domainDetail,
    setDomainDetail,
    domainModal,
    setDomainModal,
    domainHostname,
    setDomainHostname,
    domainWorkspaceId,
    setDomainWorkspaceId,
    domainError,
    setDomainError,
    handleDomainSubmit,
    openDomainModal,
    verification,
    workspaces,
    userModal,
    setUserModal,
    userName,
    setUserName,
    userEmail,
    setUserEmail,
    userPassword,
    setUserPassword,
    userWorkspaceId,
    setUserWorkspaceId,
    userRole,
    setUserRole,
    userPermissions,
    setUserPermissions,
    withPassword,
    setWithPassword,
    handleUserSubmit,
    workspaceModal,
    setWorkspaceModal,
    wsName,
    setWsName,
    wsOwnerEmail,
    setWsOwnerEmail,
    wsOwnerName,
    setWsOwnerName,
    wsWithPassword,
    setWsWithPassword,
    wsPassword,
    setWsPassword,
    wsDomainId,
    setWsDomainId,
    handleWorkspaceSubmit,
    domains,
    run,
  } = useMasterAdmin();

  const activeItem = masterNavItems.find(item => isNavActive(item, pathname)) ?? masterNavItems[0];

  function renderSidebar(className: string) {
    return (
      <aside className={className}>
        <div className="masterBrand">
          <span className="masterBrandMark">
            <Globe2 size={22} />
          </span>
          <span>
            <strong>{branding.name || "signup888"}</strong>
            <small>Control center</small>
          </span>
          {className.includes("Drawer") && (
            <IconButton icon={X} label="Close menu" onClick={() => setMenuOpen(false)} />
          )}
        </div>
        <div className="masterIdentity">
          <span>
            <ShieldCheck size={18} />
          </span>
          <div>
            <small>Master administrator</small>
            <strong>{email}</strong>
          </div>
        </div>
        <nav aria-label="Master Admin sections">
          {masterNavItems.map(item => {
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "masterNavActive" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <item.icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <ArrowRight size={14} />
              </Link>
            );
          })}
        </nav>
        <button type="button" className="masterLogout" onClick={logout}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
    );
  }

  return (
    <div className="masterShell">
      {renderSidebar("masterSidebar")}
      {menuOpen && (
        <>
          <button
            type="button"
            className="masterBackdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          {renderSidebar("masterDrawer")}
        </>
      )}

      <div className="masterWorkspace">
        <header className="masterTopbar">
          <button
            type="button"
            className="masterMenuButton"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div>
            <span>Master Admin / {activeItem.label}</span>
            <h1>{activeItem.label}</h1>
          </div>
          <Button icon={RefreshCw} loading={busy} disabled={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
        </header>

        <main className="masterMain" aria-busy={busy || loading}>
          {error && !userModal && !workspaceModal && !domainModal && (
            <div className="admError masterNotice" role="alert">
              <span>{error}</span>
              <IconButton icon={X} label="Dismiss error" onClick={() => setError("")} />
            </div>
          )}
          {message && (
            <p className="admSuccess masterNotice" role="status">
              {message}
            </p>
          )}
          {inviteUrl && (
            <div className="admCard admFormStack masterNotice">
              <Field label="Invitation link" hint="Single-use link for the invited user.">
                <input readOnly value={inviteUrl} onFocus={event => event.target.select()} />
              </Field>
              <Button
                icon={Copy}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(inviteUrl)
                    .then(() => setMessage("Link copied to clipboard."))
                    .catch(() => setError("Could not copy link."))
                }
              >
                Copy invitation link
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Global Modals */}
      {inspect && (
        <Dialog title={inspect.name} onClose={() => setInspect(null)}>
          <dl className="admMasterDetail">
            <div>
              <dt>Workspace ID</dt>
              <dd>{inspect.id}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{inspect.ownerName}</dd>
            </div>
            <div>
              <dt>Owner email</dt>
              <dd>{inspect.ownerEmail}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{inspect.status}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{inspect.createdAt ? new Date(inspect.createdAt).toLocaleString() : "-"}</dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd>{inspect.pages}</dd>
            </div>
            <div>
              <dt>Admins</dt>
              <dd>{inspect.admins}</dd>
            </div>
            <div>
              <dt>Subscribers</dt>
              <dd>{inspect.subscribers}</dd>
            </div>
            <div>
              <dt>Custom domain</dt>
              <dd>
                {inspect.domain || "Use Default Domain"}
                {inspect.domain && (
                  <small className="masterDomainState">
                    {inspect.domainStatus === "active" ? "Active" : inspect.domainStatus || "Pending"}
                  </small>
                )}
              </dd>
            </div>
          </dl>
          <div className="admDialogActions">
            <Button icon={FilePenLine} onClick={() => openEditWorkspaceModal(inspect)}>
              Edit workspace
            </Button>
          </div>
        </Dialog>
      )}

      {domainDetail && (
        <Dialog title={domainDetail.hostname} onClose={() => setDomainDetail(null)}>
          <dl className="admMasterDetail">
            <div>
              <dt>Verification</dt>
              <dd>
                <DomainBadge status={domainDetail.status} />
              </dd>
            </div>
            <div>
              <dt>SSL</dt>
              <dd>
                <DomainBadge status={domainDetail.sslStatus} />
              </dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>
                {workspaces.find(workspace => workspace.id === domainDetail.workspaceId)?.name || "Unassigned"}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(domainDetail.createdAt)}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{domainDetail.lastCheckedAt ? formatDate(domainDetail.lastCheckedAt) : "Not checked"}</dd>
            </div>
          </dl>
          {domainDetail.verificationError && (
            <p className="admError masterDomainDialogError" role="alert">
              {domainDetail.verificationError}
            </p>
          )}
          <DnsInstructions verification={verification} />
          <div className="admDialogActions">
            <Button
              icon={FilePenLine}
              onClick={() => {
                const domain = domainDetail;
                setDomainDetail(null);
                openDomainModal({ action: "edit", domain });
              }}
            >
              Edit domain
            </Button>
            {domainDetail.lastVerifiedAt && domainDetail.sslStatus !== "active" && (
              <Button
                variant="secondary"
                icon={ShieldCheck}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { adminApi } = await import("@/lib/admin");
                    const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", {
                      method: "PATCH",
                      body: JSON.stringify({ id: domainDetail.id, action: "ssl", sslStatus: "active" }),
                    });
                    setDomainDetail(result.domain);
                  })
                }
              >
                Activate SSL
              </Button>
            )}
            <Button
              variant="primary"
              icon={RefreshCw}
              disabled={busy || !verification.configured || domainDetail.status === "disabled"}
              onClick={() =>
                void run(async () => {
                  const { adminApi } = await import("@/lib/admin");
                  const result = await adminApi<{ domain: CustomDomain }>("/api/master/domains", {
                    method: "PATCH",
                    body: JSON.stringify({ id: domainDetail.id, action: "verify" }),
                  });
                  setDomainDetail(result.domain);
                })
              }
            >
              Verify DNS
            </Button>
          </div>
        </Dialog>
      )}

      {domainModal && (
        <Dialog
          title={
            domainModal === "add"
              ? "Add custom domain"
              : domainModal.action === "edit"
              ? "Edit domain"
              : domainModal.action === "assign"
              ? "Assign workspace"
              : "Delete domain"
          }
          onClose={() => {
            if (!busy) {
              setDomainModal(null);
              setDomainError("");
            }
          }}
        >
          <form onSubmit={handleDomainSubmit}>
            <fieldset disabled={busy} className="admTeamFields">
              <div className="admFormStack">
                {(domainModal === "add" || domainModal.action === "edit") && (
                  <>
                    <Field
                      label="Domain"
                      hint="Enter a hostname such as example.com. HTTPS and www are optional and will be removed automatically."
                    >
                      <input
                        required
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        placeholder="example.com"
                        value={domainHostname}
                        onChange={event => setDomainHostname(event.target.value)}
                      />
                    </Field>
                    {domainModal !== "add" &&
                      domainHostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") !==
                        domainModal.domain.hostname && (
                        <p className="admSetupNote">
                          Changing the hostname resets DNS verification and SSL status. The workspace assignment is preserved.
                        </p>
                      )}
                  </>
                )}
                {domainModal !== "add" && domainModal.action === "assign" && (
                  <>
                    <p className="admMuted">
                      Choose a workspace with no custom domain. Moving this domain away from its current workspace is completed atomically.
                    </p>
                    <Field label="Workspace">
                      <select value={domainWorkspaceId} onChange={event => setDomainWorkspaceId(event.target.value)}>
                        <option value="">Unassigned</option>
                        {workspaces
                          .filter(workspace => !workspace.domainId || workspace.id === domainModal.domain.workspaceId)
                          .map(workspace => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </>
                )}
                {domainModal !== "add" && domainModal.action === "delete" && (
                  <p>
                    Delete <strong>{domainModal.domain.hostname}</strong>? Its workspace assignment and domain history will no longer be
                    available from this record. This cannot be undone.
                  </p>
                )}
                {domainError && (
                  <p className="admError" role="alert" tabIndex={-1}>
                    {domainError}
                  </p>
                )}
              </div>
            </fieldset>
            <div className="admDialogActions">
              <Button
                disabled={busy}
                onClick={() => {
                  setDomainModal(null);
                  setDomainError("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={domainModal !== "add" && domainModal.action === "delete" ? "danger" : "primary"}
                loading={busy}
                disabled={busy}
              >
                {domainModal === "add"
                  ? "Add domain"
                  : domainModal.action === "edit"
                  ? "Save domain"
                  : domainModal.action === "assign"
                  ? "Save assignment"
                  : "Delete domain"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {userModal && (
        <Dialog
          title={
            userModal === "create"
              ? "Add user / admin"
              : userModal.action === "password"
              ? `Reset password: ${userModal.user.email}`
              : `Permissions: ${userModal.user.email}`
          }
          onClose={() => {
            if (!busy) {
              setUserModal(null);
              setUserPassword("");
              setError("");
            }
          }}
        >
          <form onSubmit={handleUserSubmit}>
            <fieldset disabled={busy} className="admTeamFields">
              <div className="admFormStack">
                {userModal === "create" && (
                  <>
                    <Field label="Name">
                      <input
                        required
                        maxLength={120}
                        autoComplete="name"
                        value={userName}
                        onChange={event => setUserName(event.target.value)}
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        required
                        type="email"
                        maxLength={190}
                        autoComplete="off"
                        value={userEmail}
                        onChange={event => setUserEmail(event.target.value)}
                      />
                    </Field>
                    <Field label="Workspace">
                      <select value={userWorkspaceId} onChange={event => setUserWorkspaceId(event.target.value)}>
                        <option value="new">+ Create a new isolated workspace</option>
                        {workspaces.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.ownerEmail})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Role">
                      <select value={userRole} onChange={event => setUserRole(event.target.value as WorkspaceRole)}>
                        <option value="owner">Workspace Admin / Owner</option>
                        <option value="member">Member</option>
                      </select>
                    </Field>
                    {userRole === "member" && (
                      <fieldset>
                        <legend>Permissions</legend>
                        {workspacePermissions.map(permission => (
                          <label className="admCheck" key={permission}>
                            <input
                              type="checkbox"
                              checked={userPermissions.includes(permission)}
                              onChange={event =>
                                setUserPermissions(current =>
                                  event.target.checked
                                    ? [...current, permission]
                                    : current.filter(item => item !== permission)
                                )
                              }
                            />
                            {permission}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <label className="admCheck">
                      <input
                        type="checkbox"
                        checked={withPassword}
                        onChange={event => setWithPassword(event.target.checked)}
                      />
                      Set a password now (immediate access)
                    </label>
                  </>
                )}

                {userModal && typeof userModal === "object" && userModal.action === "permissions" && (
                  <>
                    <Field label="Role">
                      <select value={userRole} onChange={event => setUserRole(event.target.value as WorkspaceRole)}>
                        <option value="owner">Workspace Admin / Owner</option>
                        <option value="member">Member</option>
                      </select>
                    </Field>
                    {userRole === "member" && (
                      <fieldset>
                        <legend>Permissions</legend>
                        {workspacePermissions.map(permission => (
                          <label className="admCheck" key={permission}>
                            <input
                              type="checkbox"
                              checked={userPermissions.includes(permission)}
                              onChange={event =>
                                setUserPermissions(current =>
                                  event.target.checked
                                    ? [...current, permission]
                                    : current.filter(item => item !== permission)
                                )
                              }
                            />
                            {permission}
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </>
                )}

                {((userModal === "create" && withPassword) ||
                  (userModal && typeof userModal === "object" && userModal.action === "password")) && (
                  <Field label="Password" hint="At least 8 characters.">
                    <input
                      required
                      type="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={userPassword}
                      onChange={event => setUserPassword(event.target.value)}
                    />
                  </Field>
                )}

                {error && (
                  <p className="admError" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </fieldset>
            <div className="admDialogActions">
              <Button
                disabled={busy}
                onClick={() => {
                  setUserModal(null);
                  setUserPassword("");
                  setError("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={busy}>
                {userModal === "create" ? (withPassword ? "Create account" : "Create invitation") : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {workspaceModal && (
        <Dialog
          title={workspaceModal === "create" ? "Create new workspace" : `Edit ${workspaceModal.name}`}
          onClose={() => {
            if (!busy) {
              setWorkspaceModal(null);
              setWsPassword("");
              setError("");
            }
          }}
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
                {workspaceModal === "create" && (
                  <>
                    <Field label="Owner email" hint="Leave blank to assign to Master Admin, or specify a tenant owner.">
                      <input
                        type="email"
                        maxLength={190}
                        autoComplete="off"
                        placeholder={email}
                        value={wsOwnerEmail}
                        onChange={event => setWsOwnerEmail(event.target.value)}
                      />
                    </Field>

                    {wsOwnerEmail.trim() && wsOwnerEmail.trim().toLowerCase() !== email.toLowerCase() && (
                      <>
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
                      </>
                    )}
                  </>
                )}

                <Field
                  label="Assign domain"
                  hint="Select a custom domain for this workspace. Use the default domain to remove a custom assignment."
                >
                  <select value={wsDomainId} onChange={event => setWsDomainId(event.target.value)}>
                    <option value="">Use Default Domain</option>
                    {domains
                      .filter(
                        domain =>
                          !domain.workspaceId ||
                          domain.workspaceId === (workspaceModal === "create" ? null : workspaceModal.id) ||
                          domain.id === (workspaceModal === "create" ? null : workspaceModal.domainId)
                      )
                      .map(domain => (
                        <option key={domain.id} value={domain.id}>
                          {domain.hostname}
                        </option>
                      ))}
                  </select>
                </Field>

                {error && (
                  <p className="admError" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </fieldset>
            <div className="admDialogActions">
              <Button
                disabled={busy}
                onClick={() => {
                  setWorkspaceModal(null);
                  setWsPassword("");
                  setError("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={busy}>
                {workspaceModal === "create" ? "Create workspace" : "Save workspace"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export function MasterAdminLayout({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <MasterAdminProvider email={email}>
      <MasterAdminShell>{children}</MasterAdminShell>
    </MasterAdminProvider>
  );
}
