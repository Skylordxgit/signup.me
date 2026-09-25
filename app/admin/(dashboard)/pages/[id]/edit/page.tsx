"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminContext";
import { BuilderEditor, type BuilderTab } from "@/components/admin/BuilderEditor";
import { CustomHtmlEditor } from "@/components/admin/CustomHtmlEditor";
import { Button, Dialog, IconButton, LoadingState } from "@/components/admin/AdminUI";
import { usePageEditor } from "@/components/admin/usePageEditor";
import { adminApi } from "@/lib/admin";
import type { BlockType, PageBlock, PageSummary, SmartPage } from "@/lib/types";
import { summarizePage } from "@/lib/utils";

const socialPreset = [
  { title: "Facebook", icon: "facebook" },
  { title: "Instagram", icon: "instagram" },
  { title: "WhatsApp", icon: "whatsapp" },
  { title: "Telegram", icon: "telegram" },
];

export default function EditPageBuilderRoute() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pageId = params?.id ? Number(params.id) : null;
  const initialTab = (searchParams?.get("tab") as BuilderTab) || "profile";

  const { busy, setBusy, setError, setPages, registerEditor, unregisterEditor } = useAdmin();
  const [builderTab, setBuilderTab] = useState<BuilderTab>(initialTab);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<PageBlock | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState("/admin/pages");
  const [customPage, setCustomPage] = useState<SmartPage | null>(null);

  const editor = usePageEditor(
    useCallback(
      (page: SmartPage) => {
        setPages((current) => current.map((item) => (item.id === page.id ? summarizePage(page) : item)));
      },
      [setPages]
    )
  );

  useEffect(() => {
    registerEditor(editor);
  }, [registerEditor, editor.status, editor.error, editor.page?.id, editor.page?.slug]);

  useEffect(() => {
    return () => {
      unregisterEditor();
    };
  }, [unregisterEditor]);

  const adoptPage = editor.adopt;

  useEffect(() => {
    if (!pageId || isNaN(pageId)) {
      setError("This page address is invalid.");
      setLoadingPage(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    adminApi<SmartPage>(`/api/pages/${pageId}`, { signal: controller.signal })
      .then((page) => {
        if (!cancelled) {
          if (page.pageType === "custom_html") { setCustomPage(page); setLoadingPage(false); return; }
          adoptPage(page);
          setLoadingPage(false);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load page.");
          setLoadingPage(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pageId, adoptPage, setError]);

  const handleBack = useCallback((destination = "/admin/pages") => {
    if (editor.hasUnsavedChanges()) {
      setPendingDestination(destination);
      setShowUnsavedModal(true);
      return;
    }
    router.push(destination);
  }, [editor, router]);

  async function mutateBlocks(action: () => Promise<unknown>) {
    if (!editor.page) return;
    const pageId = editor.page.id;
    setBusy(true);
    setError("");
    try {
      await editor.save();
      await action();
    } catch (cause) {
      console.error("[Standard Builder] Block update failed", cause);
      setError("Could not save the block change. Please try again.");
      setBusy(false);
      return;
    }
    // The block mutation already succeeded, so a refresh failure below is a
    // secondary UI sync issue and must not be reported as a save failure.
    try {
      editor.adopt(await adminApi<SmartPage>("/api/pages/" + pageId));
    } catch (cause) {
      console.error("[Standard Builder] Page reload failed after block update", cause);
      setError("The block change was saved, but the page could not be reloaded. Reload the page to see the latest state.");
      setBusy(false);
      return;
    }
    try {
      setPages(await adminApi<PageSummary[]>("/api/pages"));
    } catch (cause) {
      console.error("[Standard Builder] Page-list refresh failed after block update", cause);
      setError("The block change was saved, but the page list could not refresh.");
    }
    setBusy(false);
  }

  function addBlock(type: BlockType) {
    void mutateBlocks(async () => {
      if (type === "socials") {
        for (const social of socialPreset) {
          const block = await adminApi<PageBlock>("/api/pages/" + editor.page!.id + "/blocks", {
            method: "POST",
            body: JSON.stringify({ type }),
          });
          await adminApi("/api/blocks/" + block.id, {
            method: "PUT",
            body: JSON.stringify({ ...social, subtitle: "", url: "" }),
          });
        }
        return;
      }
      const block = await adminApi<PageBlock>("/api/pages/" + editor.page!.id + "/blocks", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      if (type === "video") {
        await adminApi("/api/blocks/" + block.id, {
          method: "PUT",
          body: JSON.stringify({ url: "", videoUrl: "", title: "", subtitle: "" }),
        });
      }
    });
  }

  function moveBlock(id: number, direction: number) {
    void mutateBlocks(async () => {
      const ids = [...editor.page!.blocks].sort((a, b) => a.sortOrder - b.sortOrder).map((block) => block.id);
      const index = ids.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await adminApi("/api/blocks/reorder", {
        method: "POST",
        body: JSON.stringify({ pageId: editor.page!.id, blockIds: ids }),
      });
    });
  }

  function duplicateBlock(block: PageBlock) {
    void mutateBlocks(() =>
      adminApi("/api/blocks/" + block.id, { method: "POST", body: JSON.stringify({ action: "duplicate" }) })
    );
  }

  function deleteBlock() {
    if (!deleteBlockTarget) return;
    void mutateBlocks(async () => {
      await adminApi("/api/blocks/" + deleteBlockTarget.id, { method: "DELETE" });
      setDeleteBlockTarget(null);
    });
  }

  if (loadingPage) {
    return <LoadingState label="Loading page editor..." />;
  }

  if (customPage) return <CustomHtmlEditor initialPage={customPage} />;

  if (!editor.page) {
    return (
      <div className="admCard admFormStack" role="alert" style={{ maxWidth: "520px" }}>
        <h2 style={{ margin: 0 }}>Page editor unavailable</h2>
        <p style={{ margin: 0 }}>The page could not be loaded. Return to Pages and try again.</p>
        <Button variant="primary" onClick={() => router.push("/admin/pages")}>Back to Pages</Button>
      </div>
    );
  }

  return (
    <>
      <div className="admBuilderHeading">
        <div>
          <IconButton icon={ArrowLeft} label="Back to pages" onClick={() => handleBack("/admin/pages")} />
          <span>
            <h2>{editor.page.name}</h2>
            <small>/{editor.page.slug}</small>
          </span>
        </div>
        <div className="admActionRow">
          <select
            className={`admStatusSelect admBadge-${editor.page.status}`}
            aria-label="Publishing status"
            value={editor.page.status}
            onChange={(event) => {
              const next = event.target.value as SmartPage["status"];
              const previous = editor.page?.status;
              editor.edit({ status: next });
              // Persist immediately so "Published" is only shown after the
              // server confirms it. Revert the optimistic change on failure.
              void editor.save().catch(() => {
                if (previous && editor.page?.status === next) editor.edit({ status: previous });
              });
            }}
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <BuilderEditor
        key={editor.page.id}
        page={editor.page}
        tab={builderTab}
        onTab={setBuilderTab}
        onEdit={editor.edit}
        onBlock={editor.editBlock}
        onAdd={addBlock}
        onMove={moveBlock}
        onDelete={setDeleteBlockTarget}
        onDuplicate={duplicateBlock}
        busy={busy}
      />

      {showUnsavedModal && (
        <Dialog title="Unsaved Changes" onClose={() => setShowUnsavedModal(false)}>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--c-text)", lineHeight: 1.5 }}>
            You have unsaved changes on <strong>{editor.page?.name || "this page"}</strong>. Would you like to save them before leaving?
          </p>
          <div className="admDialogActions" style={{ marginTop: "16px" }}>
            <Button onClick={() => setShowUnsavedModal(false)}>
              Stay
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                editor.discardChanges();
                setShowUnsavedModal(false);
                router.push(pendingDestination);
              }}
            >
              Discard & Leave
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await editor.save();
                } catch {
                  return;
                }
                setShowUnsavedModal(false);
                router.push(pendingDestination);
              }}
            >
              Save & Leave
            </Button>
          </div>
        </Dialog>
      )}

      {deleteBlockTarget && (
        <Dialog title="Delete block" onClose={() => setDeleteBlockTarget(null)}>
          <p>
            Delete <strong>{deleteBlockTarget.title || deleteBlockTarget.type}</strong>? This cannot be undone.
          </p>
          <div className="admDialogActions">
            <Button onClick={() => setDeleteBlockTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} disabled={busy} onClick={deleteBlock}>
              Delete block
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
