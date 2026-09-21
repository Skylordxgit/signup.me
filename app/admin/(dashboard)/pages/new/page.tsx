"use client";

import { useSearchParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminContext";
import { CreatePageForm } from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/admin";
import type { SmartPage } from "@/lib/types";

export default function CreatePageRoute() {
  const searchParams = useSearchParams();
  const initialSlug = searchParams?.get("slug") || "";
  const { busy, setBusy, setError, refreshPages, openPage } = useAdmin();

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
        body: JSON.stringify(input),
      });
      await refreshPages();
      openPage(page.id, "profile");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the page.");
    } finally {
      setBusy(false);
    }
  }

  return <CreatePageForm key={initialSlug || "blank"} initialSlug={initialSlug} busy={busy} onCreate={(input) => void handleCreate(input)} />;
}
