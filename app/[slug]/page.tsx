import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/PublicPage";
import { getPublicPageBySlug } from "@/lib/store";
import { publicPageUrl } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);

  if (!page) {
    return {
      title: "Page not found",
    };
  }

  const title = page.seo.seoTitle || page.title;
  const description = page.seo.metaDescription || page.bio;
  const image = page.seo.ogImage || page.profileImage;

  return {
    title,
    description,
    manifest: `/api/manifest/${page.slug}`,
    appleWebApp: { capable: true, title: page.title || page.name, statusBarStyle: 'default' },
    other: { 'apple-mobile-web-app-capable': 'yes' },
    openGraph: {
      title: page.seo.socialTitle || title,
      description: page.seo.socialDescription || description,
      url: publicPageUrl(page.slug),
      images: image ? [{ url: image }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: page.seo.socialTitle || title,
      description: page.seo.socialDescription || description,
      images: image ? [image] : [],
    },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);

  if (!page) notFound();

  return <PublicPage page={page} />;
}
