import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PublicPage } from "@/components/PublicPage";
import { getPublicPageBySlug } from "@/lib/store";
import { pageSlugFromHost } from "@/lib/subdomains";

export default async function Home() {
  const requestHeaders = await headers();
  const slug = pageSlugFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));

  if (slug) {
    const page = await getPublicPageBySlug(slug);
    if (!page) notFound();
    return <PublicPage page={page} />;
  }

  redirect("/admin/login");
}
