"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, editablePage } from "@/lib/admin";
import type { PageBlock, SmartPage } from "@/lib/types";

export function usePageEditor(onSaved: (page: SmartPage) => void) {
  const [page, setPage] = useState<SmartPage | null>(null);
  const [status, setStatus] = useState<"Saved" | "Unsaved changes" | "Saving" | "Save failed">("Saved");
  const [error, setError] = useState("");
  const latest = useRef<SmartPage | null>(null);
  const saved = useRef<SmartPage | null>(null);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const clearError = useCallback(() => setError(""), []);

  const adopt = useCallback((next: SmartPage) => {
    latest.current = next;
    saved.current = next;
    if (isMountedRef.current) {
      setPage(next);
      setStatus("Saved");
      setError("");
    }
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    if (!latest.current || !saved.current) return false;
    try {
      return (
        JSON.stringify(editablePage(latest.current)) !== JSON.stringify(editablePage(saved.current)) ||
        JSON.stringify(latest.current.blocks) !== JSON.stringify(saved.current.blocks)
      );
    } catch {
      return latest.current !== saved.current;
    }
  }, []);

  const discardChanges = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (saved.current) {
      latest.current = saved.current;
      if (isMountedRef.current) {
        setPage(saved.current);
        setStatus("Saved");
        setError("");
      }
    }
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const snapshot = latest.current;
    if (!snapshot) return;

    if (!hasUnsavedChanges()) {
      if (isMountedRef.current && status !== "Saved") {
        setStatus("Saved");
      }
      return;
    }

    if (isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    if (isMountedRef.current) {
      setStatus("Saving");
    }

    try {
      const response = await adminApi<SmartPage>(`/api/pages/${snapshot.id}`, {
        method: "PUT",
        body: JSON.stringify(editablePage(snapshot)),
      });

      // Update blocks that changed
      for (const block of snapshot.blocks) {
        const savedBlock = saved.current?.blocks.find((item) => item.id === block.id);
        if (savedBlock && JSON.stringify(savedBlock) === JSON.stringify(block)) continue;
        await adminApi(`/api/blocks/${block.id}`, {
          method: "PUT",
          body: JSON.stringify(block),
        });
      }

      const stored: SmartPage = {
        ...snapshot,
        slug: response.slug,
        updatedAt: response.updatedAt,
      };

      saved.current = stored;
      onSavedRef.current(stored);

      if (isMountedRef.current) {
        if (latest.current === snapshot) {
          latest.current = stored;
          setPage(stored);
          setStatus("Saved");
          setError("");
        } else if (hasUnsavedChanges()) {
          setStatus("Unsaved changes");
        } else {
          setStatus("Saved");
        }
      }
    } catch (cause) {
      if (isMountedRef.current) {
        setStatus("Save failed");
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
      }
      throw cause;
    } finally {
      isSavingRef.current = false;
    }
  }, [hasUnsavedChanges, status]);

  const edit = useCallback((patch: Partial<SmartPage>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPage(next);
    setStatus("Unsaved changes");
    setError("");

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void save().catch(() => {});
    }, 700);
  }, [save]);

  const editBlock = useCallback((id: number, patch: Partial<PageBlock>) => {
    if (!latest.current) return;
    edit({
      blocks: latest.current.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block
      ),
    });
  }, [edit]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasUnsavedChanges]);

  return {
    page,
    status,
    error,
    clearError,
    adopt,
    edit,
    editBlock,
    save,
    hasUnsavedChanges,
    discardChanges,
  };
}
