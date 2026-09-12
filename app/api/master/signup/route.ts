import { NextRequest } from 'next/server';
import { masterJson } from '@/lib/auth';
import { getSignupSettings, saveSignupSettings } from '@/lib/signupSettings';

export async function GET() {
  return masterJson(() => getSignupSettings());
}

export async function PATCH(request: NextRequest) {
  return masterJson(async () => {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') throw new Error('Choose whether signup is on or off.');
    return saveSignupSettings({ enabled: body.enabled });
  });
}
