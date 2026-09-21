"use client";

import { useAdmin } from "@/components/admin/AdminContext";
import { UsersView } from "@/components/admin/UsersView";

export default function UsersPageRoute() {
  const { account } = useAdmin();

  return (
    <UsersView
      role={account?.role || "member"}
      permissions={account?.permissions || []}
      isMaster={account?.isMaster ?? false}
    />
  );
}
