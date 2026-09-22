"use client";

import { useEffect, useState } from "react";
import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { NotificationHistoryView } from "@/components/admin/notifications/NotificationHistoryView";
import { adminApi } from "@/lib/admin";
import type { NotificationCampaign } from "@/lib/types";

export function NotificationHistoryPageRoute() {
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);

  useEffect(() => {
    adminApi<{ campaigns?: NotificationCampaign[] }>("/api/admin/notifications")
      .then((res) => {
        if (res.campaigns) setCampaigns(res.campaigns);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <NotificationHistoryView campaigns={campaigns} />
    </div>
  );
}

export default NotificationHistoryPageRoute;
