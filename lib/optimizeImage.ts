/**
 * Client-side image optimisation.
 *
 * The browser already has an image decoder and a WebP encoder, so large photos
 * are downscaled and re-encoded before they ever leave the page. That keeps
 * uploads small without adding a native image dependency to the server, which
 * would be awkward on shared Node hosting.
 *
 * Vectors and icons are passed through untouched — rasterising them would lose
 * exactly the quality they exist to provide.
 */
export type OptimizeOptions = {
  /** Longest edge of the result, in pixels. Aspect ratio is preserved. */
  maxEdge?: number;
  quality?: number;
};

const passthroughTypes = new Set(["image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);

export async function optimizeImage(file: File, options: OptimizeOptions = {}): Promise<File> {
  const { maxEdge = 1600, quality = 0.85 } = options;

  if (passthroughTypes.has(file.type)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Undecodable here is not necessarily undecodable server-side; let the
    // server make the final call rather than blocking the upload.
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });

  // Keep the original when the browser cannot encode WebP, or when re-encoding
  // made the file bigger (already-optimised images, flat graphics).
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${name}.webp`, { type: "image/webp" });
}
