import { NextResponse } from 'next/server';
import { getBranding } from '@/lib/branding';

export async function GET() {
  return NextResponse.json(await getBranding());
}
