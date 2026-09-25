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
  const inFlight = useRef<Promise<void> | null>(null);
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
    if (inFlight.current) {
      await inFlight.current;
      return save();
    }
    const snapshot = latest.current;
    if (!snapshot) return;

    if (!hasUnsavedChanges()) {
      if (isMountedRef.current) {
        setStatus("Saved");
      }
      return;
    }

    if (isMountedRef.current) {
      setStatus("Saving");
    }

    const operation = (async () => {
      // Phase 1: persist the page and its changed blocks. A failure here is a
      // genuine save failure: report it and rethrow so navigation waits.
      let stored: SmartPage;
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

        stored = {
          ...snapshot,
          slug: response.slug,
          updatedAt: response.updatedAt,
        };
        saved.current = stored;
      } catch (cause) {
        console.error("[Standard Builder] Page persistence failed", cause);
        if (isMountedRef.current) {
          setStatus("Save failed");
          setError("Page changes could not be saved. Please try again.");
        }
        throw cause;
      }

      // Phase 2: refresh the page list (a secondary UI sync). Persistence has
      // already succeeded, so a failure here must not be reported as a save
      // failure — the page is saved.
      let syncError = "";
      try {
        onSavedRef.current(stored);
      } catch (cause) {
        console.error("[Standard Builder] Page-list sync failed after save", cause);
        syncError = "Page was saved, but the page list could not refresh.";
      }

      if (isMountedRef.current) {
        if (latest.current === snapshot) {
          latest.current = stored;
          setPage(stored);
          setStatus("Saved");
          setError(syncError);
        } else if (hasUnsavedChanges()) {
          setStatus("Unsaved changes");
          if (syncError) setError(syncError);
        } else {
          setStatus("Saved");
          setError(syncError);
        }
      }
    })();
    inFlight.current = operation;
    try { await operation; } finally { inFlight.current = null; }
    // Changes made during a request must be persisted before Save/navigation completes.
    if (hasUnsavedChanges()) await save();
  }, [hasUnsavedChanges]);

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
