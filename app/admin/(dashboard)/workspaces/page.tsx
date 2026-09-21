import { redirect } from "next/navigation";
import { requireAdmin, requireMaster } from "@/lib/auth";

export default async function WorkspacesPageRoute() {
  const master = await requireMaster();
  if (master) {
    redirect("/admin/master/workspaces");
  }
  const session = await requireAdmin();
  if (!session) {
    redirect("/admin/login");
  }
  redirect("/admin/dashboard");
}
