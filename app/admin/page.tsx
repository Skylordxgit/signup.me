import { redirect } from "next/navigation";
import { requireAdmin, requireMaster } from "@/lib/auth";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const session = await requireAdmin();
  const { slug } = await searchParams;

  if (!session) {
    if (await requireMaster()) redirect("/admin/master");
    const query = slug && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) ? `?slug=${encodeURIComponent(slug)}` : "";
    redirect(`/admin/login${query}`);
  }

  if (slug && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect(`/admin/pages/new?slug=${encodeURIComponent(slug)}`);
  }

  redirect("/admin/dashboard");
}
