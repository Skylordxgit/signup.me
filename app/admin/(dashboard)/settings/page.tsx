"use client";

import { useAdmin } from "@/components/admin/AdminContext";
import { SettingsView } from "@/components/admin/DashboardViews";

export default function SettingsPageRoute() {
  const { account, collapsed, collapse, logout } = useAdmin();

  return (
    <SettingsView
      email={account?.email || ""}
      isMaster={account?.isMaster ?? false}
      customDomain={account?.customDomain}
      customDomainStatus={account?.customDomainStatus}
      collapsed={collapsed}
      onCollapse={collapse}
      onLogout={() => void logout()}
    />
  );
}
