import { redirect } from "next/navigation";

export default async function PageDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/pages/${id}/edit`);
}
