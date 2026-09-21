import type { Metadata } from 'next';
import { redirect } from "next/navigation";
import { notFound } from 'next/navigation';
import { PublicPage } from '@/components/PublicPage';
import { publicPageMetadata, resolveCurrentHost, resolveCustomDomainRoot } from '@/lib/domainRouting';
import { getCachedWorkspaceBranding } from '@/lib/workspaceBranding';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = await resolveCurrentHost();
    const page = await resolveCustomDomainRoot(host);
    if (!page) return {};
    const wsBranding = await getCachedWorkspaceBranding(page.workspaceId);
    return publicPageMetadata(page, host, true, wsBranding);
  } catch {
    return {};
  }
}

export default async function Home() {
  let host;
  try {
    host = await resolveCurrentHost();
  } catch {
    redirect("/admin/login");
  }

  if (host.kind === 'custom') {
    const page = await resolveCustomDomainRoot(host);
    if (!page) notFound();
    const wsBranding = await getCachedWorkspaceBranding(page.workspaceId);
    return <PublicPage page={page} workspaceBranding={wsBranding} />;
  }

  if (host.kind === 'unknown') {
    notFound();
  }

  redirect("/admin/login");
}
