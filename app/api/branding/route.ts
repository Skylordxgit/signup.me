import { NextRequest, NextResponse } from 'next/server';
import { getBranding } from '@/lib/branding';
import { resolveRequestHost } from '@/lib/domainRouting';
import { getCachedWorkspaceBranding } from '@/lib/workspaceBranding';

export async function GET(request: NextRequest) {
  const host = await resolveRequestHost(request);
  if (host.kind === 'custom' && host.workspaceId) {
    const wsBranding = await getCachedWorkspaceBranding(host.workspaceId);
    return NextResponse.json({
      name: wsBranding.workspaceName,
      siteTitle: wsBranding.siteTitle,
      logo: wsBranding.logoUrl,
      favicon: wsBranding.faviconUrl,
      signupEnabled: false,
      primaryColor: wsBranding.primaryColor,
      secondaryColor: wsBranding.secondaryColor,
      buttonColor: wsBranding.buttonColor,
      loginLogo: wsBranding.loginLogoUrl || wsBranding.logoUrl,
      loginBackground: wsBranding.loginBackgroundUrl,
      loginTitle: wsBranding.loginTitle,
      loginSubtitle: wsBranding.loginSubtitle,
    });
  }

  return NextResponse.json(await getBranding());
}
