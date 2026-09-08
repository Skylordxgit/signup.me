import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { NextRequest } from "next/server";
import { Readable } from "stream";
import { contentTypeFor, resolveUploadPath } from "@/lib/uploads";

/**
 * Serves uploaded media from outside `public/`, so files written at runtime are
 * available immediately and survive a rebuild. Public on purpose: these are the
 * images shown on published pages.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;

  const filePath = resolveUploadPath(segments);
  if (!filePath) return new Response("Not found", { status: 404 });

  // Only ever serve known image extensions, whatever is on disk.
  const contentType = contentTypeFor(filePath);
  if (!contentType) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "content-type": contentType,
    "content-length": String(size),
    // Filenames are content-addressed and never reused, so cache hard.
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    // An SVG is markup and would otherwise run script on this origin.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { headers });
}
