"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminContext";
import { ThemeGallery } from "@/components/admin/BuilderEditor";
import { Button, Field, PageHeader } from "@/components/admin/AdminUI";
import { defaultTheme } from "@/lib/defaults";
import { adminApi } from "@/lib/admin";
import type { SmartPage, ThemeSettings } from "@/lib/types";

export default function ThemesPageRoute() {
  const { pages, busy, setBusy, setError, refreshPages, openPage } = useAdmin();
  const [themePageId, setThemePageId] = useState("");
  const [themeSelection, setThemeSelection] = useState<ThemeSettings>(defaultTheme);

  async function applyTheme() {
    if (!themePageId || busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await adminApi<SmartPage>("/api/pages/" + themePageId);
      const nextTheme = {
        ...themeSelection,
        backgroundImage: page.theme.backgroundImage,
        profileLayout: page.theme.profileLayout,
        profileAlignment: page.theme.profileAlignment,
        showShareButton: page.theme.showShareButton,
      };
      await adminApi<SmartPage>("/api/pages/" + page.id, {
        method: "PUT",
        body: JSON.stringify({ theme: nextTheme }),
      });
      await refreshPages();
      openPage(page.id, "design");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply theme.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Themes" description="Pick a look, then apply it to one of your pages." />
      <div className="admThemeApply">
        <Field label="Apply to page">
          <select value={themePageId} onChange={(event) => setThemePageId(event.target.value)}>
            <option value="">Select a page</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="primary"
          icon={Check}
          disabled={!themePageId || busy}
          loading={busy}
          onClick={() => void applyTheme()}
        >
          Apply theme
        </Button>
      </div>
      <ThemeGallery current={themeSelection} onSelect={setThemeSelection} />
    </>
  );
}
