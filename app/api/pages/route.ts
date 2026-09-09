import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { createPage, listPages } from "@/lib/store";

export async function GET() {
  // Scoped to the session's workspace, never a workspace id from the client.
  return protectedJson((session) => listPages(session.workspaceId));
}

export async function POST(request: NextRequest) {
  return protectedJson(async (session) => {
    const body = await request.json() as Record<string, unknown> | null;
    if (!body || typeof body.name !== "string" || !body.name.trim()) throw new Error("Page name is required");
    for (const key of ["slug", "title", "bio", "profileImage"]) {
      if (body[key] !== undefined && typeof body[key] !== "string") throw new Error(`Invalid ${key}`);
    }
    return createPage({
      name: body.name,
      slug: (body.slug as string) || "",
      title: (body.title as string) || "",
      bio: (body.bio as string) || "",
      profileImage: (body.profileImage as string) || "",
      workspaceId: session.workspaceId,
    });
  });
}
