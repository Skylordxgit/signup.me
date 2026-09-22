"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NotificationNav, NotificationTabKey } from "./NotificationNav";
import { NotificationComposer } from "./NotificationComposer";
import { CampaignsView } from "./CampaignsView";
import { NotificationHistoryView } from "./NotificationHistoryView";
import { SubscribersView } from "./SubscribersView";
import { SegmentsView } from "./SegmentsView";
import { useAdmin } from "@/components/admin/AdminContext";
import { adminApi } from "@/lib/admin";
import type { PageSummary, SubscriberSegment } from "@/lib/types";
import type { WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export function NotificationsManager({
  initialTab,
  pages: passedPages,
}: {
  initialTab?: NotificationTabKey;
  pages?: PageSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname() || "/admin/notifications";
  const isWorkspace = pathname.startsWith("/workspace");
  const base = isWorkspace ? "/workspace/notifications" : "/admin/notifications";

  let adminPages: PageSummary[] = [];
  let brandingName = "Signup888";
  let brandingLogo = "/favicon.png";

  try {
    const admin = useAdmin();
    if (admin) {
      adminPages = admin.pages || [];
      if (admin.branding) {
        brandingName = admin.branding.name || brandingName;
        brandingLogo = admin.branding.logo || brandingLogo;
      }
    }
  } catch {
    // Outside admin context fallback
  }

  const effectivePages = passedPages && passedPages.length > 0 ? passedPages : adminPages;

  const determineTab = (): NotificationTabKey => {
    if (pathname.includes("/compose")) return "compose";
    if (pathname.includes("/history")) return "history";
    if (pathname.includes("/subscribers")) return "subscribers";
    if (pathname.includes("/segments")) return "segments";
    if (pathname.includes("/campaigns")) return "campaigns";
    return initialTab || "campaigns";
  };

  const [activeTab, setActiveTab] = useState<NotificationTabKey>(determineTab());
  const [locations, setLocations] = useState<WorkspaceDistinctLocations | undefined>();
  const [segments, setSegments] = useState<SubscriberSegment[]>([]);

  useEffect(() => {
    setActiveTab(determineTab());
  }, [pathname]);

  useEffect(() => {
    adminApi<{ locations?: WorkspaceDistinctLocations; segments?: SubscriberSegment[] }>("/api/admin/notifications")
      .then((res) => {
        if (res.locations) setLocations(res.locations);
        if (res.segments) setSegments(res.segments);
      })
      .catch(() => {});
  }, []);

  const handleTabChange = (nextTab: NotificationTabKey) => {
    setActiveTab(nextTab);
    const targetUrl = nextTab === "campaigns" ? `${base}/campaigns` : `${base}/${nextTab}`;
    router.push(targetUrl);
  };

  return (
    <div className="admNotificationsModule" style={{ width: "100%" }}>
      <NotificationNav activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === "compose" && (
        <NotificationComposer
          pages={effectivePages}
          locations={locations}
          segments={segments}
          brandingName={brandingName}
          brandingLogo={brandingLogo}
        />
      )}

      {activeTab === "campaigns" && (
        <CampaignsView onCompose={() => handleTabChange("compose")} />
      )}

      {activeTab === "history" && <NotificationHistoryView />}

      {activeTab === "subscribers" && <SubscribersView />}

      {activeTab === "segments" && (
        <SegmentsView onUseSegment={() => handleTabChange("compose")} />
      )}
    </div>
  );
}

export default NotificationsManager;
