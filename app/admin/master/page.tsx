import { redirect } from "next/navigation";
import { MasterDashboard } from "@/components/MasterDashboard";
import { requireMaster } from "@/lib/auth";

export default async function MasterAdminPage() {
  const session = await requireMaster();
  // Workspace owners and admins never reach this page: only a master session
  // passes, and a master session cannot reach the workspace admin.
  if (!session) redirect("/admin/login");
  return <MasterDashboard email={session.email} />;
}
