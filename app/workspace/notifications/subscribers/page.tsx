"use client";

import { NotificationsManager } from "@/components/admin/notifications/NotificationsManager";

export default function WorkspaceNotificationSubscribersPageRoute() {
  return <NotificationsManager initialTab="subscribers" />;
}
