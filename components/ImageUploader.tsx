"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { optimizeImage } from "@/lib/optimizeImage";
import type { UploadCategory } from "@/lib/uploads";

/** Mirrors the server's whitelist so bad files are caught before uploading. */
const maxBytes = 5 * 1024 * 1024;

/**
 * The single image control for the whole admin panel: click to pick, or drag a
 * file onto it. Uploads to /api/uploads and reports back the stored path, which
 * is what gets saved on the page.
 */
export function ImageUploader({
  category,
  hint,
  label,
  onChange,
  onBusyChange,
  round = false,
  value,
}: {
  category: UploadCategory;
  hint?: string;
  label: string;
  onChange: (path: string) => void;
  onBusyChange?: (busy: boolean) => void;
  round?: boolean;
  value: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const vectorAllowed = ["logo", "icon", "favicon"].includes(category);
  const acceptedTypes = ["image/jpeg", "image/png", "image/webp", ...(vectorAllowed ? ["image/svg+xml"] : []), ...(category === "favicon" ? ["image/x-icon", "image/vnd.microsoft.icon"] : [])];
  const acceptAttribute = `.jpg,.jpeg,.png,.webp${vectorAllowed ? ",.svg" : ""}${category === "favicon" ? ",.ico" : ""}`;
  useEffect(() => () => { uploadController.current?.abort(); }, []);

  async function upload(file: File) {
    if (uploadController.current) return;
    setError("");

    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!acceptedTypes.includes(file.type) && (!extension || !acceptAttribute.split(',').includes(extension))) {
      setError(vectorAllowed ? "Use a JPG, PNG, WEBP or SVG image." : "Use a JPG, PNG or WEBP image.");
      return;
    }

    const controller = new AbortController();
    uploadController.current = controller;
    setBusy(true);
    onBusyChange?.(true);
    try {
      // Compress before checking the limit: a photo straight off a phone is
      // often well over 5MB but lands far under it once resized to WebP.
      const prepared = await optimizeImage(file);
      if (controller.signal.aborted) return;
      if (prepared.size > maxBytes) {
        setError(`That image is ${(prepared.size / 1024 / 1024).toFixed(1)}MB after compression. The limit is 5MB.`);
        return;
      }

      const body = new FormData();
      body.append("file", prepared);
      body.append("category", category);

      const response = await fetch("/api/uploads", { method: "POST", body, signal: controller.signal });
      const data = (await response.json().catch(() => null)) as { path?: string; error?: string } | null;

      if (!response.ok || !data?.path) {
        setError(data?.error || "Upload failed. Please try again.");
        return;
      }
      if (!controller.signal.aborted) onChange(data.path);
    } catch {
      if (!controller.signal.aborted) setError("Upload failed. Check your connection and try again.");
    } finally {
      uploadController.current = null;
      setBusy(false);
      onBusyChange?.(false);
      // Allow re-picking the same file straight after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="uploaderField">
      <span className="uploaderLabel">{label}</span>

      <div
        className={`uploader ${dragging ? "uploaderDragging" : ""} ${busy ? "uploaderBusy" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className={`uploaderPreview ${round ? "uploaderPreviewRound" : ""}`}>
          {value ? (
            <img key={value} src={value} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
          ) : (
            <ImageIcon aria-hidden="true" />
          )}
        </span>

        <div className="uploaderBody">
          <label className="uploaderButton" htmlFor={inputId}>
            {busy ? <Loader2 className="uploaderSpinner" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
          </label>
          <small>{error ? error : hint || "Drag an image here, or click to choose. Max 5MB."}</small>
        </div>

        {value && !busy && (
          <button type="button" className="uploaderRemove" aria-label={`Remove ${label}`} onClick={() => { setError(""); onChange(""); }}>
            <Trash2 aria-hidden="true" />
          </button>
        )}

        {/* The native control stays visually hidden but focusable via the label. */}
        <input
          ref={inputRef}
          id={inputId}
          aria-label={label}
          className="uploaderInput"
          type="file"
          accept={acceptAttribute}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {error && <span className="uploaderError" role="alert">{error}</span>}
    </div>
  );
}
