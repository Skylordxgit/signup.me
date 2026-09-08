import { NextRequest } from "next/server";
import { readUpload } from "@/lib/uploads";

/**
 * Serves database-backed media, with legacy disk fallback. Public on purpose:
 * these are the images shown on published pages.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;

  const file = await readUpload(segments);
  if (!file) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": file.mime,
    "content-length": String(file.bytes.byteLength),
    // Filenames are random and never reused, so cache hard.
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    // An SVG is markup and would otherwise run script on this origin.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });

  return new Response(file.bytes, { headers });
}
