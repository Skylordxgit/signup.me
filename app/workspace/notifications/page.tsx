"use client";

import { NotificationsManager } from "@/components/admin/notifications/NotificationsManager";

export default function WorkspaceNotificationsPageRoute() {
  return <NotificationsManager initialTab="campaigns" />;
}
