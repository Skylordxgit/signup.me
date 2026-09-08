import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { requireAdmin } from "@/lib/auth";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const session = await requireAdmin();
  if (!session) {
    const { slug } = await searchParams;
    const query = slug && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) ? `?slug=${encodeURIComponent(slug)}` : "";
    redirect(`/admin/login${query}`);
  }

  return <AdminDashboard />;
}
