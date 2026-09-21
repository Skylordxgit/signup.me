import { redirect } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { MasterDashboard } from "@/components/MasterDashboard";

export default async function MasterDomainsPage() {
  const session = await requireMaster();
  if (!session) redirect("/admin/login");
  return <MasterDashboard email={session.email} initialView="domains" />;
}
