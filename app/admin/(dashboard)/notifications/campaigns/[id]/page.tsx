"use client";

import { useParams } from "next/navigation";
import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { CampaignDetailView } from "@/components/admin/notifications/CampaignDetailView";

export default function CampaignDetailPageRoute() {
  const params = useParams();
  const id = params?.id ? Number(params.id) : 0;
  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <CampaignDetailView campaignId={id} />
    </div>
  );
}
