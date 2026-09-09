import { NextRequest, NextResponse } from "next/server";
import { protectedJson, requireAdmin } from "@/lib/auth";
import {
  isSafeSvg,
  isUploadCategory,
  maxUploadBytes,
  sniffImage,
  storeUpload,
  uploadCategories,
  listMediaUploads,
} from "@/lib/uploads";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  // The media library only lists this workspace's files.
  return protectedJson((session) => listMediaUploads(session.workspaceId));
}

export async function POST(request: NextRequest) {
  // Only a signed-in admin may write files to the server.
  const session = await requireAdmin();
  if (!session) return fail("Authentication required", 401);

  // Reject an oversized body before reading it into memory where we can.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared && declared > maxUploadBytes * 1.1) {
    return fail(`File is too large. Maximum size is ${Math.round(maxUploadBytes / 1024 / 1024)}MB.`, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Could not read the upload.", 400);
  }

  const category = String(form.get("category") || "");
  if (!isUploadCategory(category)) {
    return fail(`Unknown upload category. Expected one of: ${uploadCategories.join(", ")}.`, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file was provided.", 400);
  if (file.size === 0) return fail("The file is empty.", 400);
  if (file.size > maxUploadBytes) {
    return fail(`File is too large. Maximum size is ${Math.round(maxUploadBytes / 1024 / 1024)}MB.`, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Identify by content, not by filename or the browser-supplied type.
  const kind = sniffImage(bytes);
  if (!kind) return fail("Unsupported file type. Use JPG, PNG, WEBP or SVG.", 415);

  if (kind.mime === "image/svg+xml") {
    // Favicons and logos are the only places a vector makes sense here.
    if (category !== "favicon" && category !== "logo" && category !== "icon") {
      return fail("SVG can only be used for a logo, icon or favicon.", 415);
    }
    if (!isSafeSvg(bytes)) return fail("This SVG contains scripting and was rejected.", 415);
  }

  if (kind.mime === "image/x-icon" && category !== "favicon") {
    return fail("ICO files can only be used for a favicon.", 415);
  }

  try {
    const stored = await storeUpload(category, bytes, kind, session.workspaceId);
    return NextResponse.json(stored, { status: 201 });
  } catch {
    return fail("Could not save the image to persistent storage. Please try again or check the server storage configuration.", 500);
  }
}
