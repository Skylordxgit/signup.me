"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicWorkspaceUser } from "@/lib/workspaceUsers";
import { workspacePermissions, type WorkspacePermission, type WorkspaceRole } from "@/lib/permissions";
import { adminApi } from "@/lib/admin";
import { defaultBranding, type BrandingSettings } from "@/lib/brandingConstants";
import type { CustomDomain, DomainVerificationConfig } from "@/lib/domains";

export type MasterWorkspace = {
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

export type Payload = { workspaces: MasterWorkspace[]; defaultWorkspaceId: string };
export type DomainsPayload = { domains: CustomDomain[]; verification: DomainVerificationConfig };
export type SignupSettings = { enabled: boolean };
export type DomainModal = "add" | { action: "edit" | "assign" | "delete"; domain: CustomDomain } | null;
export type UserModal = "create" | { user: PublicWorkspaceUser; action: "password" | "permissions" } | null;
export type WorkspaceModal = "create" | MasterWorkspace | null;

export interface MasterAdminContextType {
  email: string;
  workspaces: MasterWorkspace[];
  domains: CustomDomain[];
  verification: DomainVerificationConfig;
  users: PublicWorkspaceUser[];
  branding: BrandingSettings;
  signup: SignupSettings;
  loading: boolean;
  busy: boolean;
  savingBranding: boolean;
  error: string;
  message: string;
  inviteUrl: string;
  inspect: MasterWorkspace | null;
  domainDetail: CustomDomain | null;
  domainModal: DomainModal;
  domainHostname: string;
  domainWorkspaceId: string;
  domainError: string;
  userModal: UserModal;
  userName: string;
  userEmail: string;
  userPassword: string;
  userWorkspaceId: string;
  userRole: WorkspaceRole;
  userPermissions: WorkspacePermission[];
  withPassword: boolean;
  workspaceModal: WorkspaceModal;
  wsName: string;
  wsOwnerEmail: string;
  wsOwnerName: string;
  wsWithPassword: boolean;
  wsPassword: string;
  wsDomainId: string;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  setError: (err: string) => void;
  setMessage: (msg: string) => void;
  setInspect: (ws: MasterWorkspace | null) => void;
  setDomainDetail: (domain: CustomDomain | null) => void;
  setDomainHostname: (hostname: string) => void;
  setDomainWorkspaceId: (id: string) => void;
  setDomainModal: (modal: DomainModal) => void;
  setUserName: (name: string) => void;
  setUserEmail: (email: string) => void;
  setUserPassword: (pass: string) => void;
  setUserWorkspaceId: (id: string) => void;
  setUserRole: (role: WorkspaceRole) => void;
  setUserPermissions: (perms: WorkspacePermission[]) => void;
  setWithPassword: (withPass: boolean) => void;
  setUserModal: (modal: UserModal) => void;
  setWsName: (name: string) => void;
  setWsOwnerEmail: (email: string) => void;
  setWsOwnerName: (name: string) => void;
  setWsWithPassword: (withPass: boolean) => void;
  setWsPassword: (pass: string) => void;
  setWsDomainId: (id: string) => void;
  setWorkspaceModal: (modal: WorkspaceModal) => void;
  setBranding: (brand: BrandingSettings) => void;
  refresh: () => Promise<void>;
  run: (action: () => Promise<unknown>) => Promise<void>;
  saveBranding: (next?: BrandingSettings) => Promise<void>;
  updateBrandingImage: (key: "logo" | "favicon", value: string) => Promise<void>;
  updateSignup: (enabled: boolean) => Promise<void>;
  openWorkspace: (workspace: MasterWorkspace) => Promise<void>;
  openCreateWorkspaceModal: () => void;
  openEditWorkspaceModal: (workspace: MasterWorkspace) => void;
  handleWorkspaceSubmit: (event: React.FormEvent) => Promise<void>;
  openDomainModal: (modal: DomainModal) => void;
  handleDomainSubmit: (event: React.FormEvent) => Promise<void>;
  openCreateUserModal: () => void;
  openEditUserModal: (user: PublicWorkspaceUser, action: "password" | "permissions") => void;
  handleUserSubmit: (event: React.FormEvent) => Promise<void>;
  logout: () => void;
}

const MasterAdminContext = createContext<MasterAdminContextType | null>(null);

export function useMasterAdmin() {
  const ctx = useContext(MasterAdminContext);
  if (!ctx) {
    throw new Error("useMasterAdmin must be used within a MasterAdminProvider");
  }
  return ctx;
}

export function MasterAdminProvider({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [verification, setVerification] = useState<DomainVerificationConfig>({ configured: false, record: null, www: null });
  const [users, setUsers] = useState<PublicWorkspaceUser[]>([]);
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [signup, setSignup] = useState<SignupSettings>({ enabled: true });
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
  const [userModal, setUserModal] = useState<UserModal>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userWorkspaceId, setUserWorkspaceId] = useState("");
  const [userRole, setUserRole] = useState<WorkspaceRole>("owner");
  const [userPermissions, setUserPermissions] = useState<WorkspacePermission[]>([]);
  const [withPassword, setWithPassword] = useState(true);
  const [inviteUrl, setInviteUrl] = useState("");

  // Workspace management state
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModal>(null);
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
    setWorkspaces(data.workspaces);
    setDomains(domainData.domains);
    setVerification(domainData.verification);
    setBranding(brand);
    setSignup(signupSettings);
    setUsers(accounts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      adminApi<Payload>("/api/master/workspaces"),
      adminApi<DomainsPayload>("/api/master/domains"),
      adminApi<BrandingSettings>("/api/master/branding"),
      adminApi<SignupSettings>("/api/master/signup"),
      adminApi<PublicWorkspaceUser[]>("/api/master/users"),
    ])
      .then(([data, domainData, brand, signupSettings, accounts]) => {
        if (cancelled) return;
        setWorkspaces(data.workspaces);
        setDomains(domainData.domains);
        setVerification(domainData.verification);
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

  const value: MasterAdminContextType = {
    email,
    workspaces,
    domains,
    verification,
    users,
    branding,
    signup,
    loading,
    busy,
    savingBranding,
    error,
    message,
    inviteUrl,
    inspect,
    domainDetail,
    domainModal,
    domainHostname,
    domainWorkspaceId,
    domainError,
    userModal,
    userName,
    userEmail,
    userPassword,
    userWorkspaceId,
    userRole,
    userPermissions,
    withPassword,
    workspaceModal,
    wsName,
    wsOwnerEmail,
    wsOwnerName,
    wsWithPassword,
    wsPassword,
    wsDomainId,
    menuOpen,
    setMenuOpen,
    setError,
    setMessage,
    setInspect,
    setDomainDetail,
    setDomainHostname,
    setDomainWorkspaceId,
    setDomainModal,
    setUserName,
    setUserEmail,
    setUserPassword,
    setUserWorkspaceId,
    setUserRole,
    setUserPermissions,
    setWithPassword,
    setUserModal,
    setWsName,
    setWsOwnerEmail,
    setWsOwnerName,
    setWsWithPassword,
    setWsPassword,
    setWsDomainId,
    setWorkspaceModal,
    setBranding,
    refresh,
    run,
    saveBranding,
    updateBrandingImage,
    updateSignup,
    openWorkspace,
    openCreateWorkspaceModal,
    openEditWorkspaceModal,
    handleWorkspaceSubmit,
    openDomainModal,
    handleDomainSubmit,
    openCreateUserModal,
    openEditUserModal,
    handleUserSubmit,
    logout,
  };

  return <MasterAdminContext.Provider value={value}>{children}</MasterAdminContext.Provider>;
}
