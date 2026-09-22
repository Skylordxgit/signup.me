"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, Send, History, Users, Layers } from "lucide-react";

export function NotificationNav() {
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  const tabs = [
    { href: `${base}/compose`, label: "Compose", icon: PenTool, active: pathname.includes("/compose") },
    { href: `${base}/campaigns`, label: "Campaigns", icon: Send, active: pathname.includes("/campaigns") || pathname === base || pathname === `${base}/` },
    { href: `${base}/history`, label: "History", icon: History, active: pathname.includes("/history") },
    { href: `${base}/subscribers`, label: "Subscribers", icon: Users, active: pathname.includes("/subscribers") },
    { href: `${base}/segments`, label: "Segments", icon: Layers, active: pathname.includes("/segments") },
  ];

  return (
    <nav className="admSubNav" aria-label="Notification sections" style={{ marginBottom: "var(--sp-5)" }}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`admSubNavLink ${tab.active ? "admSubNavActive" : ""}`}
            aria-current={tab.active ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
