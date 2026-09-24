"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Code2, FileText } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminContext";
import { CreatePageForm } from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/admin";
import type { SmartPage } from "@/lib/types";

export default function CreatePageRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSlug = searchParams?.get("slug") || "";
  const { busy, setBusy, setError, refreshPages, openPage } = useAdmin();
  const [pageType, setPageType] = useState<"standard" | "custom_html" | null>(null);

  async function handleCreate(input: {
    name: string;
    slug: string;
    title: string;
    bio: string;
    profileImage: string;
  }) {
    setBusy(true);
    setError("");
    try {
      const page = await adminApi<SmartPage>("/api/pages", {
        method: "POST",
        body: JSON.stringify({ ...input, pageType: pageType || "standard" }),
      });
      await refreshPages();
      if (page.pageType === "custom_html") router.push(`/admin/pages/${page.id}/edit`);
      else openPage(page.id, "profile");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the page.");
    } finally {
      setBusy(false);
    }
  }

  if (!pageType) return <div className="admPageTypePicker"><h2>Choose Page Type</h2><p>Choose the editor that fits your page.</p><div><button type="button" onClick={() => setPageType("standard")}><FileText size={24} /><strong>Standard Page</strong><span>Use the current visual page builder.</span></button><button type="button" onClick={() => setPageType("custom_html")}><Code2 size={24} /><strong>Custom HTML Landing Page</strong><span>Paste secure responsive HTML with platform SEO, analytics, and notifications.</span></button></div></div>;
  return <CreatePageForm key={`${pageType}-${initialSlug || "blank"}`} initialSlug={initialSlug} busy={busy} onCreate={(input) => void handleCreate(input)} />;
}
