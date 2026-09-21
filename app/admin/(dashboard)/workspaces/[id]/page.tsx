import { redirect } from "next/navigation";
import { requireMaster } from "@/lib/auth";

export default async function WorkspaceDetailPageRoute() {
  const master = await requireMaster();
  if (master) {
    redirect("/admin/master/workspaces");
  }
  redirect("/admin/login");
}
