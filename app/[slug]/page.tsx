import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/PublicPage";
import { publicPageMetadata, resolveCurrentHost, resolvePublicPage } from '@/lib/domainRouting';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const host = await resolveCurrentHost();
  const page = await resolvePublicPage(slug, host);

  if (!page) {
    return {
      title: "Page not found",
    };
  }

  return publicPageMetadata(page, host);
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const page = await resolvePublicPage(slug);

  if (!page) notFound();

  return <PublicPage page={page} />;
}
