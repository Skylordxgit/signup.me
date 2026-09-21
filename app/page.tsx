import type { Metadata } from 'next';
import { redirect } from "next/navigation";
import { notFound } from 'next/navigation';
import { PublicPage } from '@/components/PublicPage';
import { publicPageMetadata, resolveCurrentHost, resolveCustomDomainRoot } from '@/lib/domainRouting';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = await resolveCurrentHost();
    const page = await resolveCustomDomainRoot(host);
    return page ? publicPageMetadata(page, host, true) : {};
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
    return <PublicPage page={page} />;
  }

  if (host.kind === 'unknown') {
    notFound();
  }

  redirect("/admin/login");
}
