"use client";

import { useEffect, useState } from "react";
import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { SubscribersView } from "@/components/admin/notifications/SubscribersView";
import { adminApi } from "@/lib/admin";
import type { WorkspaceDistinctLocations } from "@/lib/audienceTargeting";

export function SubscribersPageRoute() {
  const [locations, setLocations] = useState<WorkspaceDistinctLocations | undefined>();

  useEffect(() => {
    adminApi<{ locations?: WorkspaceDistinctLocations }>("/api/admin/notifications")
      .then((res) => {
        if (res.locations) setLocations(res.locations);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <SubscribersView locations={locations} />
    </div>
  );
}

export default SubscribersPageRoute;
