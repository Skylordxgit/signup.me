"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { NotificationComposer } from "@/components/admin/notifications/NotificationComposer";
import { adminApi } from "@/lib/admin";
import type { SubscriberSegment } from "@/lib/types";
import type { WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export function ComposeNotificationPageRoute() {
  const { pages, branding } = useAdmin();
  const [locations, setLocations] = useState<WorkspaceDistinctLocations | undefined>();
  const [segments, setSegments] = useState<SubscriberSegment[]>([]);

  useEffect(() => {
    adminApi<{ locations?: WorkspaceDistinctLocations; segments?: SubscriberSegment[] }>("/api/admin/notifications")
      .then((res) => {
        if (res.locations) setLocations(res.locations);
        if (res.segments) setSegments(res.segments);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <NotificationComposer
        pages={pages}
        locations={locations}
        segments={segments}
        brandingName={branding.name}
        brandingLogo={branding.logo}
      />
    </div>
  );
}

export default ComposeNotificationPageRoute;
