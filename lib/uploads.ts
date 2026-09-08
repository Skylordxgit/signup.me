import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Uploaded files live on disk, never in the database — the database only ever
 * stores the public path (e.g. "/uploads/profile/ab12….webp").
 *
 * The directory sits outside `public/` and is served by app/uploads/[...path],
 * so files written at runtime are served correctly regardless of how the
 * production build handles static assets.
 */
export const uploadRoot = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "data", "uploads");

/** Folders an upload may target. Anything else is rejected outright. */
export const uploadCategories = [
  "profile",
  "logo",
  "banner",
  "background",
  "block",
  "icon",
  "og",
  "favicon",
] as const;

export type UploadCategory = (typeof uploadCategories)[number];

export function isUploadCategory(value: string): value is UploadCategory {
  return (uploadCategories as readonly string[]).includes(value);
}

export const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);

type ImageKind = { mime: string; ext: string };

/**
 * Identify the file from its bytes rather than its name or the client-supplied
 * content type, both of which a caller can forge.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const startsWith = (...sig: number[]) => sig.every((byte, index) => bytes[index] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png" };
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return { mime: "image/x-icon", ext: "ico" };

  // RIFF....WEBP
  if (startsWith(0x52, 0x49, 0x46, 0x46)) {
    const tag = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (tag === "WEBP") return { mime: "image/webp", ext: "webp" };
  }

  // SVG is text; look for a root <svg> element near the start.
  const head = Buffer.from(bytes.slice(0, 1024)).toString("utf8").trim();
  if (/^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return { mime: "image/svg+xml", ext: "svg" };
  }

  return null;
}

/**
 * SVG is markup, so it can carry script. Files are additionally served with a
 * sandboxing CSP, but reject the obvious active content here as well.
 */
const svgDanger = /<script|<foreignObject|<!ENTITY|\son\w+\s*=|javascript:|<use[^>]+xlink:href\s*=\s*["']\s*http/i;

export function isSafeSvg(bytes: Uint8Array) {
  return !svgDanger.test(Buffer.from(bytes).toString("utf8"));
}

/** Random, extension-controlled name: the original filename is never trusted. */
function safeFileName(ext: string) {
  return `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
}

export type StoredUpload = { path: string; bytes: number; mime: string };

export async function storeUpload(
  category: UploadCategory,
  bytes: Uint8Array,
  kind: ImageKind,
): Promise<StoredUpload> {
  const directory = path.join(uploadRoot, category);
  await mkdir(directory, { recursive: true });
  const name = safeFileName(kind.ext);
  await writeFile(path.join(directory, name), bytes);
  return { path: `/uploads/${category}/${name}`, bytes: bytes.byteLength, mime: kind.mime };
}

/**
 * Resolve a request path to a file inside the upload root, or null. Rejects
 * traversal ("..", absolute paths, encoded separators) by resolving first and
 * then confirming the result is still contained by the root.
 */
export function resolveUploadPath(segments: string[]) {
  if (!segments.length) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\0"))) {
    return null;
  }

  const resolved = path.resolve(uploadRoot, ...segments);
  const root = path.resolve(uploadRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function contentTypeFor(filePath: string) {
  return contentTypes[path.extname(filePath).toLowerCase()] ?? null;
}
