import { redirect } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { MasterAdminLayout } from "@/components/admin/MasterAdminLayout";

export default async function MasterRootLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMaster();
  if (!session) redirect("/admin/login");
  return <MasterAdminLayout email={session.email}>{children}</MasterAdminLayout>;
}
