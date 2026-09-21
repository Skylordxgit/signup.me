import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { requireAdmin, requireMaster } from "@/lib/auth";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  if (!session) {
    const master = await requireMaster();
    if (!master) {
      redirect("/admin/login");
    }
  }

  return <AdminLayout>{children}</AdminLayout>;
}
