import { isIP } from 'node:net';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { SmartPage } from './types';
import { listDomains } from './domains';
import { getPrimaryPublicPage, getPublicPageBySlug } from './store';
import { isWorkspaceActive } from './workspaces';

export type PublicHost =
  | { kind: 'platform'; hostname: string }
  | { kind: 'master'; hostname: string }
  | { kind: 'custom'; hostname: string; workspaceId: string }
  | { kind: 'unknown'; hostname: string };

export function requestHostname(rawHost: string | null) {
  if (rawHost === null) return '';
  const input = rawHost.trim();
  if (!input || /[\s,/@\\?#]/.test(input)) return null;
  try { return new URL(`http://${input}`).hostname.toLowerCase().replace(/\.$/, ''); }
  catch { return null; }
}

function configuredHostname(value: string | undefined) {
  if (!value?.trim()) return '';
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/\.$/, ''); }
  catch { return ''; }
}

export function isPlatformHostname(hostname: string) {
  if (!hostname) return true;
  if (hostname === 'localhost' || isIP(hostname) || hostname.endsWith('.localhost')) return true;
  return [process.env.MASTER_ADMIN_DOMAIN, process.env.DEFAULT_APP_DOMAIN]
    .map(configuredHostname)
    .filter(Boolean)
    .includes(hostname);
}

export async function resolvePublicHost(rawHost: string | null): Promise<PublicHost> {
  const hostname = requestHostname(rawHost);
  if (hostname === null) return { kind: 'unknown', hostname: '' };
  if (hostname && hostname === configuredHostname(process.env.MASTER_ADMIN_DOMAIN)) return { kind: 'master', hostname };
  if (isPlatformHostname(hostname)) return { kind: 'platform', hostname };
  const domain = (await listDomains()).find(item => item.hostname === hostname && item.workspaceId && item.status === 'active');
  if (!domain?.workspaceId || !(await isWorkspaceActive(domain.workspaceId))) return { kind: 'unknown', hostname };
  return { kind: 'custom', hostname, workspaceId: domain.workspaceId };
}

export async function resolveRequestHost(request: Request) {
  return resolvePublicHost(request.headers.get('host'));
}

export async function resolveCurrentHost() {
  return resolvePublicHost((await headers()).get('host'));
}

export async function resolvePublicPage(slug: string, host?: PublicHost) {
  const resolvedHost = host ?? await resolveCurrentHost();
  if (resolvedHost.kind === 'unknown' || resolvedHost.kind === 'master') return null;
  return getPublicPageBySlug(slug, resolvedHost.kind === 'custom' ? resolvedHost.workspaceId : undefined);
}

export async function resolveCustomDomainRoot(host?: PublicHost) {
  const resolvedHost = host ?? await resolveCurrentHost();
  return resolvedHost.kind === 'custom' ? getPrimaryPublicPage(resolvedHost.workspaceId) : null;
}

export function canonicalPublicUrl(page: SmartPage, host: PublicHost, root = false) {
  if (host.kind === 'custom') return `https://${host.hostname}${root ? '' : `/${page.slug}`}`;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try { return new URL(`/${page.slug}`, base).toString(); }
  catch { return `/${page.slug}`; }
}

export function publicPageMetadata(page: SmartPage, host: PublicHost, root = false): Metadata {
  const title = page.seo.seoTitle || page.title;
  const description = page.seo.metaDescription || page.bio;
  const image = page.seo.ogImage || page.profileImage;
  const canonical = canonicalPublicUrl(page, host, root);
  return {
    title,
    description,
    alternates: { canonical },
    manifest: `/api/manifest/${page.slug}`,
    appleWebApp: { capable: true, title: page.title || page.name, statusBarStyle: 'default' },
    other: { 'apple-mobile-web-app-capable': 'yes' },
    openGraph: {
      title: page.seo.socialTitle || title,
      description: page.seo.socialDescription || description,
      url: canonical,
      images: image ? [{ url: image }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.seo.socialTitle || title,
      description: page.seo.socialDescription || description,
      images: image ? [image] : [],
    },
  };
}
