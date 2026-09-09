import { NextRequest } from 'next/server';
import { masterJson } from '@/lib/auth';
import { getBranding, saveBranding } from '@/lib/branding';

export async function GET() {
  return masterJson(() => getBranding());
}

export async function PATCH(request: NextRequest) {
  return masterJson(async () => saveBranding(await request.json() as Record<string, unknown>));
}
