import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/PublicPage";
import { CustomHtmlPublicPage } from "@/components/CustomHtmlPublicPage";
import { publicPageMetadata, resolveCurrentHost, resolvePublicPage } from '@/lib/domainRouting';
import { getCachedWorkspaceBranding } from '@/lib/workspaceBranding';

export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const host = await resolveCurrentHost();
    const page = await resolvePublicPage(slug, host);

    if (!page) {
      return {
        title: "Page not found",
      };
    }

    const wsBranding = await getCachedWorkspaceBranding(page.workspaceId);
    return publicPageMetadata(page, host, false, wsBranding);
  } catch {
    return {
      title: "Page not found",
    };
  }
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  let page = null;
  try {
    page = await resolvePublicPage(slug);
  } catch {
    page = null;
  }

  if (!page) notFound();

  const wsBranding = await getCachedWorkspaceBranding(page.workspaceId);
  return page.pageType === "custom_html" ? <CustomHtmlPublicPage page={page} /> : <PublicPage page={page} workspaceBranding={wsBranding} />;
}
