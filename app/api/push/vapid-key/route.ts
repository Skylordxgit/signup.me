import { NextResponse } from "next/server";
import { getPublicVapidKey } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ publicKey: await getPublicVapidKey() });
}
