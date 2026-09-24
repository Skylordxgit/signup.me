import JSZip from "jszip";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pageForSession } from "@/lib/workspaceAccess";
import { isSafeSvg, ownCustomHtmlAssets, sniffImage, storeStaticAsset } from "@/lib/uploads";

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 15 * 1024 * 1024;
const MAX_ENTRIES = 100;
const allowed = new Set([".html", ".htm", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2"]);
const scripts = new Set([".js", ".mjs", ".cjs"]);
const rejected = new Set([".php", ".py", ".rb", ".sh", ".exe", ".cgi", ".pl"]);

function safeName(name: string) {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").some(segment => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

function parseRelativeUrl(val: string) {
  const hashIdx = val.indexOf('#');
  const fragment = hashIdx >= 0 ? val.slice(hashIdx) : '';
  const withoutHash = hashIdx >= 0 ? val.slice(0, hashIdx) : val;
  const queryIdx = withoutHash.indexOf('?');
  const query = queryIdx >= 0 ? withoutHash.slice(queryIdx) : '';
  const pathname = queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
  return { pathname, query, fragment };
}

function resolveAssetUrl(rawUrl: string, assets: Map<string, string>, baseDir: string = ""): string | null {
  if (!rawUrl || /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(rawUrl)) return null;
  const { pathname, query, fragment } = parseRelativeUrl(rawUrl);
  if (!pathname) return null;
  const normalized = path.posix.normalize(baseDir ? path.posix.join(baseDir, pathname) : pathname.replace(/^\.\//, ''));
  const mapped = assets.get(normalized);
  if (!mapped) return null;
  return `${mapped}${query}${fragment}`;
}

export function rewriteUrls(input: string, assets: Map<string, string>, baseDir: string = "") {
  return input
    .replace(/(?:src|href|poster)\s*=\s*(["'])([^"']+)\1/gi, (whole, quote, value) => {
      const rewritten = resolveAssetUrl(value, assets, baseDir);
      return rewritten ? whole.replace(value, rewritten) : whole;
    })
    .replace(/srcset\s*=\s*(["'])([^"']+)\1/gi, (whole, quote, value) => {
      const items = value.split(',').map((part: string) => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.search(/\s/);
        const url = spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
        const descriptor = spaceIdx > 0 ? trimmed.slice(spaceIdx) : '';
        const rewritten = resolveAssetUrl(url, assets, baseDir);
        return rewritten ? `${rewritten}${descriptor}` : trimmed;
      });
      return `srcset=${quote}${items.join(', ')}${quote}`;
    })
    .replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi, (whole, quote, value) => {
      const rewritten = resolveAssetUrl(value, assets, baseDir);
      return rewritten ? `url(${quote}${rewritten}${quote})` : whole;
    });
}

function mimeFor(ext: string) {
  return ({ ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".gif": "image/gif" } as Record<string, string>)[ext] || "application/octet-stream";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin("pages");
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const page = await pageForSession(session, Number((await params).id));
  if (page.pageType !== "custom_html") return NextResponse.json({ error: "Not a Custom HTML page" }, { status: 400 });
  const form = await request.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || file.size > MAX_ARCHIVE_BYTES) return NextResponse.json({ error: "Upload an HTML or ZIP file up to 5 MB." }, { status: 400 });
  try {
    if (/\.html?$/i.test(file.name)) return NextResponse.json({ html: Buffer.from(await file.arrayBuffer()).toString("utf8"), warnings: [] });
    if (!/\.zip$/i.test(file.name)) throw new Error("Only HTML and ZIP files are supported.");
    const zip = await JSZip.loadAsync(await file.arrayBuffer(), { createFolders: false });
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > MAX_ENTRIES) throw new Error("ZIP archive has too many files.");
    let total = 0; const source = new Map<string, Uint8Array>(); const warnings: string[] = [];
    for (const entry of entries) { const name = safeName(entry.name); if (!name) throw new Error("ZIP contains an unsafe path."); const ext = path.extname(name).toLowerCase(); if (rejected.has(ext)) throw new Error(`ZIP contains unsupported executable file: ${name}`); const data = await entry.async("uint8array"); total += data.byteLength; if (total > MAX_EXTRACTED_BYTES) throw new Error("ZIP extracted content is too large."); if (scripts.has(ext)) { warnings.push("JavaScript files were excluded because this page uses Secure HTML mode."); continue; } if (allowed.has(ext)) source.set(name, data); }
    const index = [...source.keys()].find(name => /(^|\/)index\.html?$/i.test(name)); if (!index) throw new Error("ZIP must contain index.html.");
    const urls = new Map<string, string>();
    for (const [name, data] of source) {
      const ext = path.extname(name).toLowerCase(); if ([".html", ".htm", ".css"].includes(ext)) continue;
      const kind = sniffImage(data); if (kind?.mime === "image/svg+xml" && !isSafeSvg(data)) throw new Error(`Unsafe SVG: ${name}`);
      urls.set(name, (await storeStaticAsset(data, ext, kind?.mime || mimeFor(ext), page.workspaceId)).path);
    }
    for (const [name, data] of source) if (path.extname(name).toLowerCase() === ".css") {
      const base = path.posix.dirname(name);
      const css = rewriteUrls(Buffer.from(data).toString("utf8"), urls, base === "." ? "" : base);
      urls.set(name, (await storeStaticAsset(Buffer.from(css), ".css", "text/css; charset=utf-8", page.workspaceId)).path);
    }
    const html = rewriteUrls(Buffer.from(source.get(index)!).toString("utf8"), urls, path.posix.dirname(index) === "." ? "" : path.posix.dirname(index));
    await ownCustomHtmlAssets(page.id, page.workspaceId, [...urls.values()]);
    return NextResponse.json({ html, warnings: [...new Set(warnings)] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read upload." }, { status: 400 }); }
}
