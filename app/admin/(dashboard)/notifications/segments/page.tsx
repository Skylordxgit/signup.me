"use client";

import { NotificationNav } from "@/components/admin/notifications/NotificationNav";
import { SegmentsView } from "@/components/admin/notifications/SegmentsView";

export function SegmentsPageRoute() {
  return (
    <div className="admNotificationsModule">
      <NotificationNav />
      <SegmentsView />
    </div>
  );
}

export default SegmentsPageRoute;
