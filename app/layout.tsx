import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBranding } from '@/lib/branding';
import { resolveCurrentHost } from '@/lib/domainRouting';
import { getCachedWorkspaceBranding } from '@/lib/workspaceBranding';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = await resolveCurrentHost();
    if (host.kind === 'custom' && host.workspaceId) {
      const ws = await getCachedWorkspaceBranding(host.workspaceId);
      return {
        title: ws.siteTitle || ws.workspaceName,
        description: ws.metaDescription,
        icons: {
          icon: [{ url: ws.faviconUrl || '/favicon.ico', sizes: 'any' }],
          apple: ws.logoUrl || '/signup888-logo.png',
        },
      };
    }
  } catch {
    // Fall back to global master branding
  }

  const branding = await getBranding();
  return {
    title: branding.siteTitle,
    description:
      `Create mobile-friendly link pages, offers, requests, and analytics with ${branding.name}.`,
    icons: {
      icon: [{ url: branding.favicon, sizes: 'any' }],
      apple: branding.logo,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
