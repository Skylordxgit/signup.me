"use client";

import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { CampaignsView } from "@/components/admin/notifications/CampaignsView";

export function CampaignsPageRoute() {
  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <CampaignsView />
    </div>
  );
}

export default CampaignsPageRoute;
