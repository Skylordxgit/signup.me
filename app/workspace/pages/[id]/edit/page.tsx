import { redirect } from "next/navigation";

export default async function WorkspaceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/pages/${id}/edit`);
}
