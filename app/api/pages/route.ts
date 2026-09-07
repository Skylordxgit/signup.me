import { NextRequest } from "next/server";
import { protectedJson } from "@/lib/auth";
import { createPage, listPages } from "@/lib/store";

export async function GET() {
  return protectedJson(() => listPages());
}

export async function POST(request: NextRequest) {
  return protectedJson(async () => {
    const body = await request.json();
    return createPage(body);
  });
}
