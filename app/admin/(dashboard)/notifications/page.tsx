"use client";

import { useAdmin } from "@/components/admin/AdminContext";
import { NotificationsView } from "@/components/admin/DashboardViews";

export default function NotificationsPageRoute() {
  const { pages } = useAdmin();
  return <NotificationsView pages={pages} />;
}
