"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, Send, Users, Layers, FileCode2, ScrollText } from "lucide-react";

export type NotificationTabKey = "overview" | "create" | "campaigns" | "subscribers" | "segments" | "templates" | "logs";

export function NotificationNav({
  activeTab,
  onTabChange,
}: {
  activeTab?: NotificationTabKey;
  onTabChange?: (tab: NotificationTabKey) => void;
}) {
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const getComputedTab = (): NotificationTabKey => {
    if (activeTab) return activeTab;
    if (pathname.includes("/create") || pathname.includes("/compose")) return "create";
    if (pathname.includes("/subscribers")) return "subscribers";
    if (pathname.includes("/segments")) return "segments";
    if (pathname.includes("/templates")) return "templates";
    if (pathname.includes("/logs") || pathname.includes("/history")) return "logs";
    if (pathname.includes("/campaigns")) return "campaigns";
    return "overview";
  };

  const current = getComputedTab();

  const tabs: { key: NotificationTabKey; href: string; label: string; icon: typeof Send }[] = [
    { key: "overview", href: `${base}`, label: "Overview", icon: LayoutDashboard },
    { key: "create", href: `${base}/create`, label: "Create Campaign", icon: PlusCircle },
    { key: "campaigns", href: `${base}/campaigns`, label: "Campaigns", icon: Send },
    { key: "subscribers", href: `${base}/subscribers`, label: "Subscribers", icon: Users },
    { key: "segments", href: `${base}/segments`, label: "Segments", icon: Layers },
    { key: "templates", href: `${base}/templates`, label: "Templates", icon: FileCode2 },
    { key: "logs", href: `${base}/logs`, label: "Delivery Logs", icon: ScrollText },
  ];

  return (
    <nav
      className="admSubNav"
      role="navigation"
      aria-label="Notification sections"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px",
        marginBottom: "var(--sp-4, 16px)",
        padding: "6px",
        background: "var(--c-surface, #ffffff)",
        border: "1px solid var(--c-line, #e2e8f0)",
        borderRadius: "var(--radius-md, 8px)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = current === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            onClick={() => {
              if (onTabChange) onTabChange(tab.key);
            }}
            aria-current={isActive ? "page" : undefined}
            className={`admSubNavLink ${isActive ? "admSubNavActive" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: isActive ? "650" : "550",
              color: isActive ? "var(--c-accent, #3b82f6)" : "var(--c-muted, #64748b)",
              background: isActive ? "var(--c-accent-soft, rgba(59, 130, 246, 0.1))" : "transparent",
              border: isActive ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid transparent",
              textDecoration: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Icon size={15} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default NotificationNav;
