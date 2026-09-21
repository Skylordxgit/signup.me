import type { Metadata } from 'next';
import { redirect } from "next/navigation";
import { notFound } from 'next/navigation';
import { PublicPage } from '@/components/PublicPage';
import { publicPageMetadata, resolveCurrentHost, resolveCustomDomainRoot } from '@/lib/domainRouting';

export async function generateMetadata(): Promise<Metadata> {
  const host = await resolveCurrentHost();
  const page = await resolveCustomDomainRoot(host);
  return page ? publicPageMetadata(page, host, true) : {};
}

export default async function Home() {
  const host = await resolveCurrentHost();
  if (host.kind === 'unknown') notFound();
  if (host.kind === 'custom') {
    const page = await resolveCustomDomainRoot(host);
    if (!page) notFound();
    return <PublicPage page={page} />;
  }
  redirect("/admin/login");
}
