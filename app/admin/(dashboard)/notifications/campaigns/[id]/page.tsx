"use client";

import { use } from "react";
import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { CampaignDetailView } from "@/components/admin/notifications/CampaignDetailView";

export function CampaignDetailPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <CampaignDetailView campaignId={Number(id)} />
    </div>
  );
}

export default CampaignDetailPageRoute;
