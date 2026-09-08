import { randomBytes } from "crypto";
import { existsSync } from "fs";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Uploaded files live on disk, never in the database — the database only ever
 * stores the public path (e.g. "/uploads/profile/ab12….webp").
 *
 * The directory sits outside `public/` and is served by app/uploads/[...path],
 * so files written at runtime are served correctly regardless of how the
 * production build handles static assets.
 */

function moduleDirectory() {
  try {
    const url = import.meta.url;
    if (!url || !url.startsWith("file:")) return null;
    return path.dirname(fileURLToPath(url));
  } catch {
    return null;
  }
}

/**
 * Where the app is installed, which — unlike process.cwd() — does not change
 * with however the host happens to launch the process. A standalone build runs
 * from <app>/dist/standalone, so step back out of the build output first.
 */
function applicationRoot() {
  const directory = moduleDirectory();
  if (!directory) return null;

  const buildOutput = `${path.sep}dist${path.sep}standalone`;
  const index = directory.indexOf(buildOutput);
  let current = index === -1 ? directory : directory.slice(0, index);

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function distinctPaths(values: (string | null)[]) {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const resolved = path.resolve(value);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    roots.push(resolved);
  }
  return roots;
}

const configuredRoot = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : null;
const installedRoot = applicationRoot();

/**
 * Every directory an upload may live in. New files are written to the first
 * entry; all of them are searched when serving.
 *
 * Resolving only against process.cwd() meant that restarting the app from a
 * different directory — which a host's process manager may well do — left
 * every stored path pointing at a directory the app no longer looked in, so
 * saved images 404'd while the database and the files were both intact.
 */
export const uploadRoots = distinctPaths([
  configuredRoot,
  installedRoot ? path.join(installedRoot, "data", "uploads") : null,
  path.join(process.cwd(), "data", "uploads"),
]);

export const uploadRoot = uploadRoots[0];

if (!configuredRoot && process.env.NODE_ENV === "production") {
  console.warn(
    `[uploads] UPLOAD_DIR is not set, so uploads are written to ${uploadRoot}. `
    + "Point UPLOAD_DIR at a directory outside the deploy folder to keep them across deployments.",
  );
}

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

export type MediaFile = StoredUpload & { name: string; category: UploadCategory; updatedAt: string };

export async function listMediaUploads(): Promise<MediaFile[]> {
  const files: MediaFile[] = [];
  const seen = new Set<string>();
  for (const root of uploadRoots) {
    for (const category of uploadCategories) {
      const directory = path.join(root, category);
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const key = `${category}/${entry.name}`;
        if (seen.has(key)) continue;
        const filePath = path.join(directory, entry.name);
        const mime = contentTypeFor(filePath);
        if (!mime) continue;
        seen.add(key);
        const info = await stat(filePath);
        files.push({ name: entry.name, category, path: `/uploads/${category}/${encodeURIComponent(entry.name)}`, mime, bytes: info.size, updatedAt: info.mtime.toISOString() });
      }
    }
  }
  return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

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
 * Resolve a request path to a file in one of the upload roots, or null.
 * Rejects traversal ("..", absolute paths, encoded separators) by resolving
 * first and then confirming the result is still contained by that root — which
 * is checked per root, so searching several of them widens where a file may be
 * found without widening what a request can reach.
 */
export function resolveUploadPath(segments: string[]) {
  if (!segments.length) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\0"))) {
    return null;
  }

  let fallback: string | null = null;
  for (const root of uploadRoots) {
    const resolved = path.resolve(root, ...segments);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) continue;
    if (existsSync(resolved)) return resolved;
    fallback ??= resolved;
  }
  // Nothing on disk: hand back the primary location so the caller reports the
  // same "not found" it always did.
  return fallback;
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
