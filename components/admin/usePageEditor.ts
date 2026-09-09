"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, editablePage } from "@/lib/admin";
import type { PageBlock, SmartPage } from "@/lib/types";

export function usePageEditor(onSaved: (page: SmartPage) => void) {
  const [page, setPage] = useState<SmartPage | null>(null);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const latest = useRef<SmartPage | null>(null);
  const saved = useRef<SmartPage | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  const clearError = useCallback(() => setError(""), []);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const adopt = useCallback((next: SmartPage) => {
    latest.current = next;
    saved.current = next;
    setPage(next);
    setStatus("Saved");
    setError("");
  }, []);

  const edit = useCallback((patch: Partial<SmartPage>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPage(next);
    setStatus("Unsaved changes");
    setError("");
  }, []);

  const editBlock = useCallback((id: number, patch: Partial<PageBlock>) => {
    if (latest.current) edit({ blocks: latest.current.blocks.map(block => block.id === id ? { ...block, ...patch } : block) });
  }, [edit]);

  const save = useCallback(async () => {
    const snapshot = latest.current;
    if (!snapshot) return;
    const operation = queue.current.catch(() => {}).then(async () => {
      if (saved.current === snapshot) return;
      setStatus("Saving");
      try {
        const response = await adminApi<SmartPage>(`/api/pages/${snapshot.id}`, { method: "PUT", body: JSON.stringify(editablePage(snapshot)) });
        // The JSON store performs read/modify/write, so block writes must be serial.
        for (const block of snapshot.blocks) {
          if (JSON.stringify(saved.current?.blocks.find(item => item.id === block.id)) === JSON.stringify(block)) continue;
          await adminApi(`/api/blocks/${block.id}`, { method: "PUT", body: JSON.stringify(block) });
        }
        // The server normalises the slug (and keeps the previous one when the
        // field is blank), so mirror what was stored instead of leaving the
        // editor and the preview link pointing at a slug that does not exist.
        const stored = { ...snapshot, slug: response.slug, updatedAt: response.updatedAt };
        saved.current = stored;
        onSavedRef.current(stored);
        if (latest.current === snapshot) {
          latest.current = stored;
          setPage(stored);
          setStatus("Saved");
          setError("");
        }
      } catch (cause) {
        setStatus("Save failed");
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
        throw cause;
      }
    });
    queue.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    if (!page || page === saved.current) return;
    const timer = window.setTimeout(() => { void save().catch(() => {}); }, 700);
    return () => window.clearTimeout(timer);
  }, [page, save]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);

  return { page, status, error, clearError, adopt, edit, editBlock, save };
}
