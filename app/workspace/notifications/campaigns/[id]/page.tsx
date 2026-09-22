import { redirect } from "next/navigation";

export default async function WorkspaceCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/notifications/campaigns/${id}`);
}
