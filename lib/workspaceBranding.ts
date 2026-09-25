import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery, type TransactionQuery } from './mysql';
import { DEFAULT_WORKSPACE_ID } from './workspaceConstants';
import { isValidImageUrl } from './utils';
import { defaultBranding } from './brandingConstants';
import { defaultWorkspaceBranding, type WorkspaceBranding, type WorkspaceBrandingInput } from './workspaceBrandingConstants';
import { cacheDelete, cacheGetOrSet, cacheInvalidatePrefix } from './cache';
import type { SmartPage } from './types';

export { defaultWorkspaceBranding };
export type { WorkspaceBranding, WorkspaceBrandingInput };

function file() {
  return path.join(process.cwd(), 'data', 'workspace_branding.json');
}

let fileLock: Promise<unknown> = Promise.resolve();

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())) {
    return value.trim();
  }
  return fallback;
}

export function normalizeWorkspaceBranding(
  input: Partial<WorkspaceBranding> | null | undefined,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  workspaceName?: string,
): WorkspaceBranding {
  const defaults = defaultWorkspaceBranding(workspaceId, workspaceName);
  if (!input) return defaults;

  const wsName = typeof input.workspaceName === 'string' && input.workspaceName.trim()
    ? input.workspaceName.trim().slice(0, 120)
    : defaults.workspaceName;

  const siteTitle = typeof input.siteTitle === 'string' && input.siteTitle.trim()
    ? input.siteTitle.trim().slice(0, 200)
    : (input.siteTitle === '' ? '' : defaults.siteTitle);

  const metaDescription = typeof input.metaDescription === 'string' && input.metaDescription.trim()
    ? input.metaDescription.trim().slice(0, 500)
    : (input.metaDescription === '' ? '' : defaults.metaDescription);

  const logoUrl = typeof input.logoUrl === 'string' && input.logoUrl.trim() && isValidImageUrl(input.logoUrl.trim())
    ? input.logoUrl.trim()
    : defaults.logoUrl;

  const faviconUrl = typeof input.faviconUrl === 'string' && input.faviconUrl.trim() && isValidImageUrl(input.faviconUrl.trim())
    ? input.faviconUrl.trim()
    : defaults.faviconUrl;

  const loginLogoUrl = typeof input.loginLogoUrl === 'string' && input.loginLogoUrl.trim() && isValidImageUrl(input.loginLogoUrl.trim())
    ? input.loginLogoUrl.trim()
    : '';

  const loginBackgroundUrl = typeof input.loginBackgroundUrl === 'string' && input.loginBackgroundUrl.trim() && isValidImageUrl(input.loginBackgroundUrl.trim())
    ? input.loginBackgroundUrl.trim()
    : '';

  const loginTitle = typeof input.loginTitle === 'string' && input.loginTitle.trim()
    ? input.loginTitle.trim().slice(0, 160)
    : (input.loginTitle === '' ? '' : defaults.loginTitle);

  const loginSubtitle = typeof input.loginSubtitle === 'string' && input.loginSubtitle.trim()
    ? input.loginSubtitle.trim().slice(0, 300)
    : (input.loginSubtitle === '' ? '' : defaults.loginSubtitle);

  const primaryColor = normalizeColor(input.primaryColor, defaults.primaryColor);
  const secondaryColor = normalizeColor(input.secondaryColor, defaults.secondaryColor);
  const buttonColor = normalizeColor(input.buttonColor, defaults.buttonColor);
  const linkColor = normalizeColor(input.linkColor, defaults.linkColor);

  const footerText = typeof input.footerText === 'string'
    ? input.footerText.trim().slice(0, 400)
    : '';

  return {
    workspaceId,
    workspaceName: wsName,
    siteTitle,
    metaDescription,
    logoUrl,
    faviconUrl,
    loginLogoUrl,
    loginBackgroundUrl,
    loginTitle,
    loginSubtitle,
    primaryColor,
    secondaryColor,
    buttonColor,
    linkColor,
    footerText,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function readJsonStore(): Promise<Record<string, WorkspaceBranding>> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as Record<string, WorkspaceBranding>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function mutateJsonStore<T>(change: (store: Record<string, WorkspaceBranding>) => T): Promise<T> {
  const operation = fileLock.catch(() => {}).then(async () => {
    const store = await readJsonStore();
    const result = change(store);
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  fileLock = operation;
  return operation;
}

export async function getWorkspaceBranding(workspaceId: string): Promise<WorkspaceBranding> {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<{
      id: number;
      workspace_id: string;
      workspace_name: string | null;
      logo_url: string | null;
      favicon_url: string | null;
      site_title: string | null;
      meta_description: string | null;
      login_logo_url: string | null;
      login_background_url: string | null;
      login_title: string | null;
      login_subtitle: string | null;
      primary_color: string | null;
      secondary_color: string | null;
      button_color: string | null;
      link_color: string | null;
      footer_text: string | null;
      created_at: Date;
      updated_at: Date;
    }[]>('SELECT * FROM workspace_branding WHERE workspace_id = ? LIMIT 1', [wsId]);

    if (rows.length > 0) {
      const row = rows[0];
      return normalizeWorkspaceBranding({
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name || undefined,
        logoUrl: row.logo_url || undefined,
        faviconUrl: row.favicon_url || undefined,
        siteTitle: row.site_title || undefined,
        metaDescription: row.meta_description || undefined,
        loginLogoUrl: row.login_logo_url || undefined,
        loginBackgroundUrl: row.login_background_url || undefined,
        loginTitle: row.login_title || undefined,
        loginSubtitle: row.login_subtitle || undefined,
        primaryColor: row.primary_color || undefined,
        secondaryColor: row.secondary_color || undefined,
        buttonColor: row.button_color || undefined,
        linkColor: row.link_color || undefined,
        footerText: row.footer_text || undefined,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
      }, wsId);
    }
  } else {
    const store = await readJsonStore();
    if (store[wsId]) {
      return normalizeWorkspaceBranding(store[wsId], wsId);
    }
  }

  return defaultWorkspaceBranding(wsId);
}

const BRANDING_CACHE_TTL_SECONDS = 300; // 5 minutes cache

export function workspaceBrandingCacheKey(workspaceId: string) {
  return `ws:branding:${workspaceId || DEFAULT_WORKSPACE_ID}`;
}

export async function getCachedWorkspaceBranding(workspaceId: string): Promise<WorkspaceBranding> {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  const key = workspaceBrandingCacheKey(wsId);
  return cacheGetOrSet<WorkspaceBranding>(
    key,
    async () => getWorkspaceBranding(wsId),
    BRANDING_CACHE_TTL_SECONDS,
  );
}

export async function invalidateWorkspaceBranding(workspaceId: string) {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  await Promise.allSettled([
    cacheDelete(workspaceBrandingCacheKey(wsId)),
    cacheInvalidatePrefix(`page:pub:${wsId}:`),
    cacheInvalidatePrefix(`page:prim:${wsId}`),
    cacheDelete(`page:prim:${wsId}`),
  ]);
}

export async function saveWorkspaceBranding(
  workspaceId: string,
  input: WorkspaceBrandingInput,
  query: TransactionQuery = mysqlQuery,
): Promise<WorkspaceBranding> {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  const current = await getWorkspaceBranding(wsId);
  const next = normalizeWorkspaceBranding({ ...current, ...input }, wsId);

  if (hasMysqlConfig()) {
    await query(
      `INSERT INTO workspace_branding (
        workspace_id, workspace_name, logo_url, favicon_url, site_title, meta_description,
        login_logo_url, login_background_url, login_title, login_subtitle,
        primary_color, secondary_color, button_color, link_color, footer_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        workspace_name = VALUES(workspace_name),
        logo_url = VALUES(logo_url),
        favicon_url = VALUES(favicon_url),
        site_title = VALUES(site_title),
        meta_description = VALUES(meta_description),
        login_logo_url = VALUES(login_logo_url),
        login_background_url = VALUES(login_background_url),
        login_title = VALUES(login_title),
        login_subtitle = VALUES(login_subtitle),
        primary_color = VALUES(primary_color),
        secondary_color = VALUES(secondary_color),
        button_color = VALUES(button_color),
        link_color = VALUES(link_color),
        footer_text = VALUES(footer_text),
        updated_at = CURRENT_TIMESTAMP`,
      [
        wsId,
        next.workspaceName,
        next.logoUrl,
        next.faviconUrl,
        next.siteTitle,
        next.metaDescription,
        next.loginLogoUrl,
        next.loginBackgroundUrl,
        next.loginTitle,
        next.loginSubtitle,
        next.primaryColor,
        next.secondaryColor,
        next.buttonColor,
        next.linkColor,
        next.footerText,
      ],
    );
    const rows = await query<{
      id: number;
      workspace_id: string;
      workspace_name: string | null;
      logo_url: string | null;
      favicon_url: string | null;
      site_title: string | null;
      meta_description: string | null;
      login_logo_url: string | null;
      login_background_url: string | null;
      login_title: string | null;
      login_subtitle: string | null;
      primary_color: string | null;
      secondary_color: string | null;
      button_color: string | null;
      link_color: string | null;
      footer_text: string | null;
      created_at: Date;
      updated_at: Date;
    }[]>('SELECT * FROM workspace_branding WHERE workspace_id = ? LIMIT 1', [wsId]);
    if (!rows[0]) throw new Error('Workspace branding could not be saved.');
    const saved = normalizeWorkspaceBranding({
      id: rows[0].id,
      workspaceId: rows[0].workspace_id,
      workspaceName: rows[0].workspace_name || undefined,
      logoUrl: rows[0].logo_url || undefined,
      faviconUrl: rows[0].favicon_url || undefined,
      siteTitle: rows[0].site_title || undefined,
      metaDescription: rows[0].meta_description || undefined,
      loginLogoUrl: rows[0].login_logo_url || undefined,
      loginBackgroundUrl: rows[0].login_background_url || undefined,
      loginTitle: rows[0].login_title || undefined,
      loginSubtitle: rows[0].login_subtitle || undefined,
      primaryColor: rows[0].primary_color || undefined,
      secondaryColor: rows[0].secondary_color || undefined,
      buttonColor: rows[0].button_color || undefined,
      linkColor: rows[0].link_color || undefined,
      footerText: rows[0].footer_text || undefined,
      createdAt: rows[0].created_at ? new Date(rows[0].created_at).toISOString() : undefined,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : undefined,
    }, wsId);
    await invalidateWorkspaceBranding(wsId);
    return saved;
  } else {
    await mutateJsonStore(store => {
      store[wsId] = next;
    });
  }

  await invalidateWorkspaceBranding(wsId);
  return next;
}

export async function resetWorkspaceBranding(workspaceId: string): Promise<WorkspaceBranding> {
  const wsId = workspaceId || DEFAULT_WORKSPACE_ID;
  const defaults = defaultWorkspaceBranding(wsId);

  if (hasMysqlConfig()) {
    await mysqlQuery('DELETE FROM workspace_branding WHERE workspace_id = ?', [wsId]);
  } else {
    await mutateJsonStore(store => {
      delete store[wsId];
    });
  }

  await invalidateWorkspaceBranding(wsId);
  return defaults;
}

/**
 * Merges workspace branding defaults with page-specific overrides.
 * Rule: If page-specific setting exists -> use page setting, otherwise use workspace branding default.
 */
export function resolveEffectivePageBranding(page: SmartPage, workspaceBranding?: WorkspaceBranding | null) {
  const ws = workspaceBranding || defaultWorkspaceBranding(page.workspaceId);
  return {
    siteTitle: page.seo?.seoTitle || page.title || page.name || ws.siteTitle,
    metaDescription: page.seo?.metaDescription || page.bio || ws.metaDescription,
    favicon: page.seo?.favicon || ws.faviconUrl || defaultBranding.favicon,
    ogImage: page.seo?.ogImage || page.profileImage || page.logoImage || ws.logoUrl,
    logoImage: page.logoImage || page.profileImage || ws.logoUrl,
    buttonColor: page.theme?.buttonBackground || ws.buttonColor || ws.primaryColor,
    footerText: page.theme.footerText || ws.footerText,
  };
}
