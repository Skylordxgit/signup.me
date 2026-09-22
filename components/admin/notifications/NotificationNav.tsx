"use client";

import { usePathname, useRouter } from "next/navigation";
import { PenTool, Send, History, Users, Layers } from "lucide-react";

export type NotificationTabKey = "compose" | "campaigns" | "history" | "subscribers" | "segments";

export function NotificationNav({
  activeTab,
  onTabChange,
}: {
  activeTab?: NotificationTabKey;
  onTabChange?: (tab: NotificationTabKey) => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const getComputedTab = (): NotificationTabKey => {
    if (activeTab) return activeTab;
    if (pathname.includes("/compose")) return "compose";
    if (pathname.includes("/history")) return "history";
    if (pathname.includes("/subscribers")) return "subscribers";
    if (pathname.includes("/segments")) return "segments";
    return "campaigns";
  };

  const current = getComputedTab();

  const tabs: { key: NotificationTabKey; href: string; label: string; icon: typeof Send }[] = [
    { key: "compose", href: `${base}/compose`, label: "Compose", icon: PenTool },
    { key: "campaigns", href: `${base}/campaigns`, label: "Campaigns", icon: Send },
    { key: "history", href: `${base}/history`, label: "History", icon: History },
    { key: "subscribers", href: `${base}/subscribers`, label: "Subscribers", icon: Users },
    { key: "segments", href: `${base}/segments`, label: "Segments", icon: Layers },
  ];

  const handleSelect = (tab: (typeof tabs)[number]) => {
    if (onTabChange) {
      onTabChange(tab.key);
    } else {
      router.push(tab.href);
    }
  };

  return (
    <nav
      className="admSubNav"
      role="tablist"
      aria-label="Notification sections"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "var(--sp-5)",
        padding: "6px",
        background: "var(--c-surface-sunken, #f1f5f9)",
        border: "1px solid var(--c-line, #e2e8f0)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = current === tab.key;
        return (
          <button
            type="button"
            role="tab"
            key={tab.key}
            onClick={() => handleSelect(tab)}
            aria-selected={isActive}
            className={`admSubNavLink ${isActive ? "admSubNavActive" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: isActive ? 600 : 500,
              background: isActive ? "var(--c-surface, #ffffff)" : "transparent",
              color: isActive ? "var(--c-accent, #0f172a)" : "var(--c-muted, #64748b)",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              border: isActive ? "1px solid var(--c-line, #cbd5e1)" : "1px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
              userSelect: "none",
            }}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
