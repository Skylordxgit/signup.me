import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBranding } from '@/lib/branding';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
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
