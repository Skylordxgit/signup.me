"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminContext";
import { BuilderEditor, type BuilderTab } from "@/components/admin/BuilderEditor";
import { Button, Dialog, IconButton, LoadingState } from "@/components/admin/AdminUI";
import { usePageEditor } from "@/components/admin/usePageEditor";
import { adminApi } from "@/lib/admin";
import type { BlockType, PageBlock, SmartPage } from "@/lib/types";
import { summarizePage } from "@/lib/utils";

const socialPreset = [
  { title: "Facebook", icon: "facebook" },
  { title: "Instagram", icon: "instagram" },
  { title: "WhatsApp", icon: "whatsapp" },
  { title: "Telegram", icon: "telegram" },
];

export default function EditPageBuilderRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pageId = params?.id ? Number(params.id) : null;
  const initialTab = (searchParams?.get("tab") as BuilderTab) || "profile";

  const { busy, setBusy, setError, setPages, navigate, registerEditor, unregisterEditor } = useAdmin();
  const [builderTab, setBuilderTab] = useState<BuilderTab>(initialTab);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<PageBlock | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);

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
    return () => {
      unregisterEditor();
    };
  }, [editor, registerEditor, unregisterEditor]);

  const adoptPage = editor.adopt;

  useEffect(() => {
    if (!pageId || isNaN(pageId)) return;
    let cancelled = false;
    adminApi<SmartPage>(`/api/pages/${pageId}`)
      .then((page) => {
        if (!cancelled) {
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
    };
  }, [pageId, adoptPage, setError]);

  async function mutateBlocks(action: () => Promise<unknown>) {
    if (!editor.page) return;
    setBusy(true);
    try {
      await editor.save();
      await action();
      editor.adopt(await adminApi<SmartPage>("/api/pages/" + editor.page.id));
      const items = await adminApi<SmartPage[]>("/api/pages");
      setPages(items.map(summarizePage));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update block.");
    } finally {
      setBusy(false);
    }
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

  if (loadingPage || !editor.page) {
    return <LoadingState label="Loading page editor..." />;
  }

  return (
    <>
      <div className="admBuilderHeading">
        <div>
          <IconButton icon={ArrowLeft} label="Back to pages" onClick={() => void navigate("/admin/pages")} />
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
            onChange={(event) => editor.edit({ status: event.target.value as SmartPage["status"] })}
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
