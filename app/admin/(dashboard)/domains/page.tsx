import { redirect } from "next/navigation";
import { requireAdmin, requireMaster } from "@/lib/auth";

export default async function DomainsPageRoute() {
  const master = await requireMaster();
  if (master) {
    redirect("/admin/master/domains");
  }
  const session = await requireAdmin();
  if (!session) {
    redirect("/admin/login");
  }
  redirect("/admin/settings");
}
