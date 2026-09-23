"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PageSummary, SmartPage } from "@/lib/types";
import { adminApi } from "@/lib/admin";
import { canAccess, type WorkspacePermission, type WorkspaceRole } from "@/lib/permissions";
import { fallbackBranding, fetchBranding, type ClientBranding } from "../AuthBranding";
import type { WorkspaceBranding } from "@/lib/workspaceBrandingConstants";
import { summarizePage } from "@/lib/utils";

export type AdminAccount = {
  email: string;
  role: WorkspaceRole;
  permissions: WorkspacePermission[];
  isMaster?: boolean;
  workspaceName: string;
  customDomain: string | null;
  customDomainStatus: string | null;
  platformOrigin?: string | null;
};

export type ActiveEditorHandle = {
  page: SmartPage | null;
  status: string;
  error: string;
  clearError: () => void;
  save: () => Promise<void>;
  hasUnsavedChanges?: () => boolean;
  discardChanges?: () => void;
};

export type AdminContextType = {
  account: AdminAccount | null;
  branding: ClientBranding;
  setBranding: React.Dispatch<React.SetStateAction<ClientBranding>>;
  pages: PageSummary[];
  setPages: React.Dispatch<React.SetStateAction<PageSummary[]>>;
  loading: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  error: string;
  setError: (err: string) => void;
  query: string;
  setQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  sort: string;
  setSort: (sort: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  collapse: (value: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  deleteTarget: PageSummary | null;
  setDeleteTarget: (target: PageSummary | null) => void;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  importNotice: string;
  setImportNotice: (notice: string) => void;
  refreshPages: () => Promise<void>;
  bulkPageStatus: (ids: number[], status: 'draft' | 'disabled') => Promise<number[]>;
  exportPages: (ids: number[]) => Promise<string>;
  duplicatePage: (id: number) => Promise<SmartPage>;
  deletePage: (id: number) => Promise<void>;
  openPage: (id: number, tab?: string) => void;
  navigate: (href: string) => Promise<void>;
  logout: () => Promise<void>;
  activeEditor: ActiveEditorHandle | null;
  registerEditor: (handle: ActiveEditorHandle) => void;
  unregisterEditor: () => void;
  allowedView: (permission?: WorkspacePermission) => boolean;
};

const AdminContext = createContext<AdminContextType | null>(null);

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [branding, setBranding] = useState<ClientBranding>(fallbackBranding);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("smartlink_sidebar_collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageSummary | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const activeEditorRef = useRef<ActiveEditorHandle | null>(null);
  const [activeEditor, setActiveEditor] = useState<ActiveEditorHandle | null>(null);
  const actionBusy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    Promise.all([
      adminApi<AdminAccount>("/api/auth/me", { signal: controller.signal }),
      fetchBranding(),
      adminApi<WorkspaceBranding>("/api/admin/branding", { signal: controller.signal }).catch(() => null),
      adminApi<PageSummary[]>("/api/pages", { signal: controller.signal }).catch(() => []),
    ])
      .then(async ([acc, brand, wsBrand, pagesData]) => {
        if (cancelled) return;
        setAccount(acc);
        if (wsBrand) {
          setBranding({
            name: wsBrand.workspaceName || brand.name,
            logo: wsBrand.logoUrl || brand.logo,
            signupEnabled: false,
          });
        } else {
          setBranding(brand);
        }

        // The initial response is authoritative, including an empty workspace.
        // Do not trigger a second request just because there are no pages yet.
        setPages(pagesData || []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the workspace.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const collapse = useCallback((value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem("smartlink_sidebar_collapsed", String(value));
    } catch {
      // Storage unavailable
    }
  }, []);

  const refreshPages = useCallback(async () => {
    try {
      const items = await adminApi<PageSummary[]>("/api/pages");
      setPages(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh pages.");
    }
  }, []);

  const bulkPageStatus = useCallback(async (ids: number[], status: "draft" | "disabled") => {
    const updated: number[] = [];
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      try {
        await Promise.race([editor.save(), new Promise((resolve) => setTimeout(resolve, 1500))]);
      } catch {
        // continue
      }
    }
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const page = await adminApi<SmartPage>("/api/pages/" + id, {
          method: "PUT",
          body: JSON.stringify({ status }),
        });
        updated.push(id);
        setPages((current) => current.map((item) => (item.id === id ? summarizePage(page) : item)));
      } catch {
        failed.push(pages.find((p) => p.id === id)?.name || String(id));
      }
    }
    if (failed.length) {
      throw new Error(`Could not update: ${failed.join(", ")}. These pages remain selected for retry.`);
    }
    return updated;
  }, [pages]);

  const exportPages = useCallback(async (ids: number[]) => {
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      try {
        await Promise.race([editor.save(), new Promise((resolve) => setTimeout(resolve, 1500))]);
      } catch {
        // continue
      }
    }
    const response = await fetch("/api/pages/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(failure?.error || "Could not export the selected pages.");
    }
    const blob = await response.blob();
    const name =
      /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] ||
      `signup888-pages-export-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return `Exported ${ids.length} page${ids.length === 1 ? "" : "s"} to ${name}`;
  }, []);

  const duplicatePage = useCallback(async (id: number) => {
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      try {
        await Promise.race([editor.save(), new Promise((resolve) => setTimeout(resolve, 1500))]);
      } catch {
        // continue
      }
    }
    const duplicated = await adminApi<SmartPage>("/api/pages/" + id + "/duplicate", { method: "POST" });
    await refreshPages();
    return duplicated;
  }, [refreshPages]);

  const deletePage = useCallback(async (id: number) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const editor = activeEditorRef.current;
      if (editor && editor.hasUnsavedChanges?.()) {
        try {
          await Promise.race([editor.save(), new Promise((resolve) => setTimeout(resolve, 1500))]);
        } catch {
          // continue
        }
      }
      await adminApi("/api/pages/" + id, { method: "DELETE" });
      setDeleteTarget(null);
      await refreshPages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the page.");
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }, [refreshPages]);

  const openPage = useCallback((id: number, tab?: string) => {
    const destination = `/admin/pages/${id}/edit${tab ? `?tab=${tab}` : ""}`;
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      void Promise.race([
        editor.save(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]).finally(() => {
        router.push(destination);
      });
    } else {
      router.push(destination);
    }
  }, [router]);

  const navigate = useCallback(async (href: string) => {
    setDrawerOpen(false);
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      try {
        await Promise.race([
          editor.save(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch {
        // Continue navigation
      }
    }
    router.push(href);
  }, [router]);

  const logout = useCallback(async () => {
    const editor = activeEditorRef.current;
    if (editor && editor.hasUnsavedChanges?.()) {
      try {
        await Promise.race([
          editor.save(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch {
        // proceed
      }
    }
    await adminApi("/api/auth/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }, []);

  const registerEditor = useCallback((handle: ActiveEditorHandle) => {
    activeEditorRef.current = handle;
    setActiveEditor(handle);
  }, []);

  const unregisterEditor = useCallback(() => {
    activeEditorRef.current = null;
    setActiveEditor(null);
  }, []);

  const allowedView = useCallback((permission?: WorkspacePermission) => {
    if (!account) return true;
    return !permission || canAccess(account, permission);
  }, [account]);

  return (
    <AdminContext.Provider
      value={{
        account,
        branding,
        setBranding,
        pages,
        setPages,
        loading,
        busy,
        setBusy,
        error,
        setError,
        query,
        setQuery,
        statusFilter,
        setStatusFilter,
        sort,
        setSort,
        collapsed,
        setCollapsed,
        collapse,
        drawerOpen,
        setDrawerOpen,
        deleteTarget,
        setDeleteTarget,
        importOpen,
        setImportOpen,
        importNotice,
        setImportNotice,
        refreshPages,
        bulkPageStatus,
        exportPages,
        duplicatePage,
        deletePage,
        openPage,
        navigate,
        logout,
        activeEditor,
        registerEditor,
        unregisterEditor,
        allowedView,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
