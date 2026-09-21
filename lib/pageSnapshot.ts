import type { SmartPage } from './types';
import { cacheDelete, cacheGetOrSet, cacheInvalidatePrefix } from './cache';
import { getPrimaryPublicPage as storeGetPrimary, getPublicPageBySlug as storeGetBySlug } from './store';
import { listDomains } from './domains';
import { isWorkspaceActive } from './workspaces';
import { isPlatformHostname, requestHostname, type PublicHost } from './domainRouting';
import { DEFAULT_WORKSPACE_ID } from './workspaceConstants';

const PAGE_CACHE_TTL_SECONDS = 600; // 10 minutes cache
const DOMAIN_CACHE_TTL_SECONDS = 300; // 5 minutes cache

export function pageCacheKey(slug: string, workspaceId?: string) {
  return `page:pub:${workspaceId || 'default'}:${slug.toLowerCase()}`;
}

export function primaryPageCacheKey(workspaceId?: string) {
  return `page:prim:${workspaceId || 'default'}`;
}

export function domainCacheKey(hostname: string) {
  return `domain:host:${hostname.toLowerCase()}`;
}

/**
 * High-concurrency cached public page lookup with cache stampede protection.
 * On cache hit, ZERO database queries are executed.
 */
export async function getCachedPublicPage(slug: string, workspaceId?: string): Promise<SmartPage | null> {
  const key = pageCacheKey(slug, workspaceId);
  return cacheGetOrSet<SmartPage | null>(
    key,
    async () => {
      return storeGetBySlug(slug, workspaceId);
    },
    PAGE_CACHE_TTL_SECONDS
  );
}

/**
 * High-concurrency cached primary page lookup for root domain requests.
 */
export async function getCachedPrimaryPublicPage(workspaceId?: string): Promise<SmartPage | null> {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  const key = primaryPageCacheKey(wsId);
  return cacheGetOrSet<SmartPage | null>(
    key,
    async () => {
      return storeGetPrimary(wsId);
    },
    PAGE_CACHE_TTL_SECONDS
  );
}

/**
 * High-concurrency cached custom domain host resolution.
 * Caches hostname -> workspace mapping so public requests don't scan `custom_domains` on every hit.
 */
export async function getCachedPublicHost(rawHost: string | null): Promise<PublicHost> {
  const hostname = requestHostname(rawHost);
  if (hostname === null || !hostname) return { kind: 'platform', hostname: '' };
  if (isPlatformHostname(hostname)) return { kind: 'platform', hostname };

  const key = domainCacheKey(hostname);
  return cacheGetOrSet<PublicHost>(
    key,
    async () => {
      try {
        const domainList = await listDomains();
        const domain = domainList.find(item => item.hostname === hostname && item.workspaceId && item.status === 'active');
        if (domain?.workspaceId && (await isWorkspaceActive(domain.workspaceId))) {
          return { kind: 'custom', hostname, workspaceId: domain.workspaceId };
        }
      } catch (error) {
        console.error('Error resolving custom domain host:', error);
      }
      return { kind: 'unknown', hostname };
    },
    DOMAIN_CACHE_TTL_SECONDS
  );
}

/**
 * Invalidate cached snapshot for a page when modified or published by admin.
 */
export async function invalidatePublishedPageCache(slug: string, workspaceId?: string) {
  await Promise.allSettled([
    cacheDelete(pageCacheKey(slug, workspaceId)),
    cacheDelete(primaryPageCacheKey(workspaceId)),
    cacheInvalidatePrefix(`page:pub:`),
    cacheInvalidatePrefix(`page:prim:`),
  ]);
}

/**
 * Invalidate domain cache when domain assignments change.
 */
export async function invalidateDomainCache(hostname?: string) {
  if (hostname) {
    await cacheDelete(domainCacheKey(hostname));
  } else {
    await cacheInvalidatePrefix('domain:host:');
  }
}
