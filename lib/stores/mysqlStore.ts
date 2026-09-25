import { createHash, randomUUID } from "crypto";
import type { AnalyticsReport, AudienceFilters, BlockType, CityDetailMetric, CountryDetailMetric, CustomHtmlLinkMetric, CustomHtmlSettings, LocationMetric, NotificationCampaign, NotificationSendInput, NotificationSendResult, NotificationSubscriberSummary, NotificationTemplate, PageBlock, PageStatus, PushSubscriptionRecord, RecentActivityItem, RegionDetailMetric, SmartPage, SubscriberSegment } from "../types";
import { defaultTheme, seedTemplates } from "../defaults";
import { detectDevice, emptyBlock, isValidSlug, isValidImageUrl, isValidUrl, nowIso, safeReferrer, slugify } from "../utils";
import { mysqlQuery, withTransaction } from "../mysql";
import { configureWebPush, notificationPayload, sendPushBatch } from "../push";
import type { SubscriberDetails } from '../types';
import { subscriberListItem } from '../subscriberDetails';
import { DEFAULT_WORKSPACE_ID } from '../workspaces';
import { matchSubscriber } from "../audienceTargeting";
import { invalidatePublishedPageCache, warmPublishedPageCache } from "../pageSnapshot";
import { enqueueCustomHtmlLinkClick, enqueueLinkClick, enqueuePageView } from "../analyticsQueue";
import { emptyCustomHtml } from "../customHtml";
import { duplicateCustomHtmlAssetOwnership, removeCustomHtmlAssetOwnership } from "../uploads";

type PageRow = {
  id: number;
  workspace_id?: string | null;
  page_type?: "standard" | "custom_html";
  name: string;
  slug: string;
  title: string;
  bio: string;
  profile_image: string | null;
  logo_image: string | null;
  status: PageStatus;
  theme_settings: unknown;
  seo_settings: unknown;
  integration_settings: unknown;
  views: number;
  unique_visitors: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type BlockRow = {
  workspace_id: string;
  id: number;
  page_id: number;
  type: BlockType;
  title: string;
  subtitle: string | null;
  url: string | null;
  icon: string | null;
  phone: string | null;
  message: string | null;
  image_url: string | null;
  video_url: string | null;
  settings: unknown;
  sort_order: number;
  is_active: number | boolean;
  clicks: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type PushRow = {
  workspace_id: string;
  id: number;
  page_id: number;
  slug: string;
  endpoint_hash: string;
  subscription_json: unknown;
  user_agent: string | null;
  client_details: unknown;
  is_active?: number | boolean;
  last_failed_at?: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CampaignRow = {
  id: number;
  workspace_id: string;
  page_id: number | null;
  page_slug: string | null;
  title: string;
  body: string;
  url: string;
  audience: string;
  attempted: number;
  sent: number;
  delivered: number;
  seen: number;
  clicked: number;
  failed: number;
  removed: number;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapBlock(row: BlockRow): PageBlock {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    pageId: row.page_id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle ?? "",
    url: row.url ?? "",
    icon: row.icon ?? "",
    phone: row.phone ?? "",
    message: row.message ?? "",
    imageUrl: row.image_url ?? "",
    videoUrl: row.video_url ?? "",
    settings: toJson(row.settings, {}),
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    clicks: row.clicks,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapPage(row: PageRow, blocks: PageBlock[], customHtml?: CustomHtmlSettings): SmartPage {
  return {
    id: row.id,
    // Rows migrated from the single-workspace schema default to 'default'.
    workspaceId: row.workspace_id || DEFAULT_WORKSPACE_ID,
    name: row.name,
    slug: row.slug,
    title: row.title,
    bio: row.bio,
    profileImage: row.profile_image ?? "",
    logoImage: row.logo_image ?? "",
    status: row.status,
    theme: toJson(row.theme_settings, defaultTheme),
    seo: toJson(row.seo_settings, {
      seoTitle: "",
      metaDescription: "",
      socialTitle: "",
      socialDescription: "",
      ogImage: "",
      favicon: "",
    }),
    integrations: toJson(row.integration_settings, { metaPixelId: "", gtmId: "" }),
    views: row.views,
    uniqueVisitors: row.unique_visitors,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    blocks: blocks.sort((a, b) => a.sortOrder - b.sortOrder),
    pageType: row.page_type || "standard",
    customHtml,
  };
}

async function blocksForPage(pageId: number) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT * FROM page_blocks WHERE page_id = ?", [pageId]);
  return rows.map(mapBlock);
}

async function loadPage(pageId: number, workspaceId?: string) {
  const rows = await mysqlQuery<PageRow[]>(`SELECT * FROM pages WHERE id = ?${workspaceId !== undefined ? ' AND workspace_id = ?' : ''}`, [pageId, ...(workspaceId !== undefined ? [workspaceId] : [])]);
  if (!rows[0]) return null;
  const custom = rows[0].page_type === "custom_html"
    ? (await mysqlQuery<{ content: unknown }[]>("SELECT content FROM custom_html_pages WHERE page_id = ?", [pageId]))[0]
    : null;
  return mapPage(rows[0], await blocksForPage(pageId), custom ? toJson(custom.content, emptyCustomHtml()) : undefined);
}

function visitorHash(visitorKey: string) {
  return createHash("sha256").update(visitorKey).digest("hex");
}

function subscriptionHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

let pushTableReady: Promise<void> | null = null;
let campaignTableReady: Promise<void> | null = null;

function ensurePushTable() {
  pushTableReady ??= mysqlQuery(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      page_id BIGINT UNSIGNED NOT NULL,
      workspace_id CHAR(36) NOT NULL,
      endpoint_hash CHAR(64) NOT NULL,
      subscription_json JSON NOT NULL,
      user_agent VARCHAR(500) NULL,
      client_details JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_failed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_push_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
      INDEX idx_push_page (page_id)
      ,UNIQUE KEY idx_push_workspace_endpoint (workspace_id, endpoint_hash)
    )`,
  ).then(async () => {
    // Upgrade existing installations automatically; concurrent workers may race.
    for (const { name, sql } of [
      { name: 'workspace_id', sql: "ALTER TABLE push_subscriptions ADD COLUMN workspace_id CHAR(36) NOT NULL DEFAULT 'default'" },
      { name: 'client_details', sql: 'ALTER TABLE push_subscriptions ADD COLUMN client_details JSON NULL' },
      { name: 'is_active', sql: 'ALTER TABLE push_subscriptions ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'last_failed_at', sql: 'ALTER TABLE push_subscriptions ADD COLUMN last_failed_at TIMESTAMP NULL' },
    ]) {
      const columns = await mysqlQuery<{ Field: string }[]>(`SHOW COLUMNS FROM push_subscriptions LIKE '${name}'`);
      if (!columns.length) {
        try { await mysqlQuery(sql); }
        catch (error) { if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error; }
      }
    }
    await mysqlQuery('UPDATE push_subscriptions ps INNER JOIN pages p ON p.id = ps.page_id SET ps.workspace_id = p.workspace_id WHERE ps.workspace_id <> p.workspace_id');
    const indexes = await mysqlQuery<{ Key_name: string }[]>('SHOW INDEX FROM push_subscriptions');
    if (!indexes.some(index => index.Key_name === 'idx_push_workspace_endpoint')) {
      try { await mysqlQuery('ALTER TABLE push_subscriptions ADD UNIQUE KEY idx_push_workspace_endpoint (workspace_id, endpoint_hash)'); }
      catch (error) { if ((error as { code?: string }).code !== 'ER_DUP_KEYNAME') throw error; }
    }
    if (indexes.some(index => index.Key_name === 'endpoint_hash')) {
      try { await mysqlQuery('ALTER TABLE push_subscriptions DROP INDEX endpoint_hash'); }
      catch (error) { if ((error as { code?: string }).code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error; }
    }
  }).catch(error => { pushTableReady = null; throw error; });
  return pushTableReady;
}

function ensureCampaignTable() {
  campaignTableReady ??= mysqlQuery(
    `CREATE TABLE IF NOT EXISTS notification_campaigns (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      workspace_id VARCHAR(80) NOT NULL,
      page_id BIGINT UNSIGNED NULL,
      page_slug VARCHAR(120) NULL,
      title VARCHAR(120) NOT NULL,
      body VARCHAR(255) NOT NULL,
      url VARCHAR(700) NOT NULL,
      audience VARCHAR(190) NOT NULL,
      attempted INT UNSIGNED NOT NULL DEFAULT 0,
      sent INT UNSIGNED NOT NULL DEFAULT 0,
      delivered INT UNSIGNED NOT NULL DEFAULT 0,
      seen INT UNSIGNED NOT NULL DEFAULT 0,
      clicked INT UNSIGNED NOT NULL DEFAULT 0,
      failed INT UNSIGNED NOT NULL DEFAULT 0,
      removed INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_campaign_workspace_created (workspace_id, created_at),
      INDEX idx_campaign_page (page_id)
    )`,
  ).then(async () => {
    for (const { name, sql } of [
      { name: 'delivered', sql: 'ALTER TABLE notification_campaigns ADD COLUMN delivered INT UNSIGNED NOT NULL DEFAULT 0' },
      { name: 'seen', sql: 'ALTER TABLE notification_campaigns ADD COLUMN seen INT UNSIGNED NOT NULL DEFAULT 0' },
      { name: 'clicked', sql: 'ALTER TABLE notification_campaigns ADD COLUMN clicked INT UNSIGNED NOT NULL DEFAULT 0' },
    ]) {
      const columns = await mysqlQuery<{ Field: string }[]>(`SHOW COLUMNS FROM notification_campaigns LIKE '${name}'`);
      if (!columns.length) {
        try { await mysqlQuery(sql); }
        catch (error) { if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error; }
      }
    }
  }).catch(error => { campaignTableReady = null; throw error; });
  return campaignTableReady;
}

export async function listPages(workspaceId?: string) {
  const rows = await mysqlQuery<(PageRow & { clicks: number })[]>(
    `SELECT p.*, COALESCE(SUM(b.clicks), 0) AS clicks
     FROM pages p
     LEFT JOIN page_blocks b ON b.page_id = p.id
     ${workspaceId ? 'WHERE p.workspace_id = ?' : ''}
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
    workspaceId ? [workspaceId] : [],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    views: row.views,
    uniqueVisitors: row.unique_visitors,
    clicks: Number(row.clicks),
    updatedAt: toIso(row.updated_at),
    pageType: row.page_type || "standard",
  }));
}

export async function getPageById(id: number, workspaceId?: string) {
  return loadPage(id, workspaceId);
}

/** Page totals per workspace, for the master admin overview. */
export async function pagesByWorkspace() {
  const rows = await mysqlQuery<{ id: number; workspace_id: string | null }[]>('SELECT id, workspace_id FROM pages');
  return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id || DEFAULT_WORKSPACE_ID }));
}

export async function getPublicPageBySlug(slug: string, workspaceId?: string) {
  const rows = await mysqlQuery<PageRow[]>(`SELECT * FROM pages WHERE slug = ? AND status = 'published'${workspaceId ? ' AND workspace_id = ?' : ''}`, [slug, ...(workspaceId ? [workspaceId] : [])]);
  if (!rows[0]) return null;
  return loadPage(rows[0].id, workspaceId);
}

export async function getPrimaryPublicPage(workspaceId: string) {
  const rows = await mysqlQuery<PageRow[]>("SELECT * FROM pages WHERE workspace_id = ? AND status = 'published' ORDER BY id LIMIT 1", [workspaceId]);
  if (!rows[0]) return null;
  return loadPage(rows[0].id, workspaceId);
}

export async function createPage(input: {
  name: string;
  slug: string;
  title: string;
  bio: string;
  profileImage: string;
  workspaceId?: string;
}) {
  const slug = slugify(input.slug || input.name);
  if (!isValidSlug(slug)) throw new Error("Invalid slug");
  if (input.profileImage && !isValidImageUrl(input.profileImage)) throw new Error("Invalid profile image URL");

  const existing = await mysqlQuery<{ id: number }[]>("SELECT id FROM pages WHERE slug = ?", [slug]);
  if (existing.length) throw new Error("Slug already exists");

  const seo = {
    seoTitle: `${input.title || input.name} - Official Links`,
    metaDescription: input.bio.trim(),
    socialTitle: input.title || input.name,
    socialDescription: input.bio.trim(),
    ogImage: "",
    favicon: "",
  };
  const integrations = { metaPixelId: "", gtmId: "" };

  const result = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO pages (workspace_id, name, slug, title, bio, profile_image, logo_image, status, theme_settings, seo_settings, integration_settings, views, unique_visitors)
     VALUES (?, ?, ?, ?, ?, ?, '', 'published', ?, ?, ?, 0, 0)`,
    [
      input.workspaceId || DEFAULT_WORKSPACE_ID,
      input.name.trim(),
      slug,
      input.title.trim() || input.name.trim(),
      input.bio.trim(),
      input.profileImage.trim(),
      JSON.stringify(defaultTheme),
      JSON.stringify(seo),
      JSON.stringify(integrations),
    ],
  );

  const page = await loadPage(result.insertId);
  if (!page) throw new Error("Failed to create page");
  if (page.workspaceId !== (input.workspaceId || DEFAULT_WORKSPACE_ID)) throw new Error("Page could not be created in the selected workspace.");
  void invalidatePublishedPageCache(page.slug, page.workspaceId);
  return page;
}

export async function createCustomHtmlPage(input: { name: string; slug: string; title?: string; workspaceId?: string }): Promise<SmartPage> {
  const slug = slugify(input.slug || input.name);
  if (!isValidSlug(slug)) throw new Error("Invalid slug");
  if ((await mysqlQuery<{ id: number }[]>("SELECT id FROM pages WHERE slug = ?", [slug])).length) throw new Error("Slug already exists");
  const result = await withTransaction(async query => {
    const created = await query<{ insertId: number }>(
      `INSERT INTO pages (workspace_id, page_type, name, slug, title, bio, profile_image, logo_image, status, theme_settings, seo_settings, integration_settings, views, unique_visitors)
       VALUES (?, 'custom_html', ?, ?, ?, '', '', '', 'draft', ?, ?, ?, 0, 0)`,
      [input.workspaceId || DEFAULT_WORKSPACE_ID, input.name.trim(), slug, input.title?.trim() || input.name.trim(), JSON.stringify(defaultTheme), JSON.stringify({ seoTitle: input.title || input.name, metaDescription: "", socialTitle: "", socialDescription: "", ogImage: "", favicon: "" }), JSON.stringify({ metaPixelId: "", gtmId: "" })],
    );
    await query("INSERT INTO custom_html_pages (page_id, content) VALUES (?, ?)", [created.insertId, JSON.stringify(emptyCustomHtml())]);
    return created.insertId;
  });
  const page = await loadPage(result);
  if (!page) throw new Error("Failed to create Custom HTML page");
  if (page.pageType !== "custom_html" || !page.customHtml) throw new Error("Custom HTML page details could not be created.");
  return page;
}

export async function saveCustomHtmlDraft(id: number, customHtml: CustomHtmlSettings) {
  const current = await loadPage(id);
  if (!current || current.pageType !== "custom_html") return null;
  await mysqlQuery(
    "INSERT INTO custom_html_pages (page_id, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP",
    [id, JSON.stringify(customHtml)],
  );
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  void invalidatePublishedPageCache(current.slug, current.workspaceId);
  if (customHtml.publishedHtml) {
    void warmPublishedPageCache(current.slug, current.workspaceId);
  }
  return loadPage(id);
}

export async function updatePage(id: number, patch: Partial<SmartPage>) {
  const current = await loadPage(id);
  if (!current) return null;

  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  if (!isValidSlug(nextSlug)) throw new Error("Invalid slug");

  if (nextSlug !== current.slug) {
    const clash = await mysqlQuery<{ id: number }[]>("SELECT id FROM pages WHERE slug = ? AND id != ?", [nextSlug, id]);
    if (clash.length) throw new Error("Slug already exists");
  }

  const status = patch.status as PageStatus | undefined;
  if (status && !["published", "draft", "disabled"].includes(status)) throw new Error("Invalid status");
  if (patch.profileImage && !isValidImageUrl(patch.profileImage)) throw new Error("Invalid profile image URL");
  if (patch.logoImage && !isValidImageUrl(patch.logoImage)) throw new Error("Invalid logo image URL");
  if (patch.theme?.backgroundImage && !isValidImageUrl(patch.theme.backgroundImage)) throw new Error("Invalid cover image URL");
  if (patch.seo?.ogImage && !isValidImageUrl(patch.seo.ogImage)) throw new Error("Invalid social image URL");
  if (patch.seo?.favicon && !isValidImageUrl(patch.seo.favicon)) throw new Error("Invalid favicon URL");

  const merged: SmartPage = {
    ...current,
    ...patch,
    slug: nextSlug,
    updatedAt: nowIso(),
    blocks: patch.blocks ?? current.blocks,
  };

  await mysqlQuery(
    `UPDATE pages SET name = ?, slug = ?, title = ?, bio = ?, profile_image = ?, logo_image = ?, status = ?, theme_settings = ?, seo_settings = ?, integration_settings = ?
     WHERE id = ?`,
    [
      merged.name,
      merged.slug,
      merged.title,
      merged.bio,
      merged.profileImage,
      merged.logoImage,
      merged.status,
      JSON.stringify(merged.theme),
      JSON.stringify(merged.seo),
      JSON.stringify(merged.integrations),
      id,
    ],
  );

  void invalidatePublishedPageCache(current.slug, current.workspaceId);
  if (nextSlug !== current.slug) {
    void invalidatePublishedPageCache(nextSlug, current.workspaceId);
  }
  if (merged.status === "published") {
    void warmPublishedPageCache(nextSlug, current.workspaceId);
  }

  return loadPage(id);
}

export async function deletePage(id: number) {
  const current = await loadPage(id);
  if (current) {
    void invalidatePublishedPageCache(current.slug, current.workspaceId);
    if (current.pageType === "custom_html") {
      await removeCustomHtmlAssetOwnership(id, current.workspaceId);
    }
  }
  const result = await mysqlQuery<{ affectedRows: number }>("DELETE FROM pages WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

export async function duplicatePage(id: number) {
  const page = await loadPage(id);
  if (!page) return null;

  const duplicateSlugBase = `${page.slug}-copy`;
  let duplicateSlug = duplicateSlugBase;
  let suffix = 2;
  while ((await mysqlQuery<{ id: number }[]>("SELECT id FROM pages WHERE slug = ?", [duplicateSlug])).length) {
    duplicateSlug = `${duplicateSlugBase}-${suffix}`;
    suffix += 1;
  }

  const newId = await withTransaction(async (query) => {
    const result = await query<{ insertId: number }>(
      `INSERT INTO pages (workspace_id, page_type, name, slug, title, bio, profile_image, logo_image, status, theme_settings, seo_settings, integration_settings, views, unique_visitors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, 0)`,
      [
        page.workspaceId,
        page.pageType || "standard",
        `${page.name} Copy`,
        duplicateSlug,
        page.title,
        page.bio,
        page.profileImage,
        page.logoImage,
        JSON.stringify(page.theme),
        JSON.stringify(page.seo),
        JSON.stringify(page.integrations),
      ],
    );
    const newPageId = result.insertId;

    if (page.pageType === "custom_html" && page.customHtml) {
      await query("INSERT INTO custom_html_pages (page_id, content) VALUES (?, ?)", [newPageId, JSON.stringify({ ...page.customHtml, publishedHtml: "", publishedVersion: 0 })]);
    }

    for (const block of page.blocks) {
      await query(
        `INSERT INTO page_blocks (workspace_id, page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          page.workspaceId,
          newPageId,
          block.type,
          block.title,
          block.subtitle,
          block.url,
          block.icon,
          block.phone,
          block.message,
          block.imageUrl,
          block.videoUrl,
          JSON.stringify(block.settings),
          block.sortOrder,
          block.isActive,
        ],
      );
    }

    return newPageId;
  });

  if (page.pageType === "custom_html") {
    await duplicateCustomHtmlAssetOwnership(page.id, newId, page.workspaceId);
  }

  return loadPage(newId);
}

export async function createBlock(pageId: number, type: BlockType) {
  const page = await loadPage(pageId);
  if (!page) return null;

  const block = emptyBlock(pageId, type, page.blocks.length + 1);
  const result = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO page_blocks (workspace_id, page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      page.workspaceId,
      pageId,
      block.type,
      block.title,
      block.subtitle,
      block.url,
      block.icon,
      block.phone,
      block.message,
      block.imageUrl,
      block.videoUrl,
      JSON.stringify(block.settings),
      block.sortOrder,
      block.isActive,
    ],
  );
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [pageId]);
  void invalidatePublishedPageCache(page.slug, page.workspaceId);

  return { ...block, workspaceId: page.workspaceId, id: result.insertId };
}

/** The page a block belongs to, so routes can check the workspace before
 *  touching it. Returns null when the block does not exist. */
export async function blockPageId(id: number) {
  const rows = await mysqlQuery<{ page_id: number }[]>('SELECT page_id FROM page_blocks WHERE id = ?', [id]);
  return rows[0]?.page_id ?? null;
}

export async function updateBlock(id: number, patch: Partial<PageBlock>) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT * FROM page_blocks WHERE id = ?", [id]);
  const row = rows[0];
  if (!row) return null;

  if (patch.url && !isValidUrl(patch.url) && !patch.url.includes("@") && !patch.url.startsWith("@")) {
    throw new Error("Invalid URL");
  }

  const merged = { ...mapBlock(row), ...patch, updatedAt: nowIso() };

  await mysqlQuery(
    `UPDATE page_blocks SET type = ?, title = ?, subtitle = ?, url = ?, icon = ?, phone = ?, message = ?, image_url = ?, video_url = ?, settings = ?, sort_order = ?, is_active = ?
     WHERE id = ?`,
    [
      merged.type,
      merged.title,
      merged.subtitle,
      merged.url,
      merged.icon,
      merged.phone,
      merged.message,
      merged.imageUrl,
      merged.videoUrl,
      JSON.stringify(merged.settings),
      merged.sortOrder,
      merged.isActive,
      id,
    ],
  );
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [row.page_id]);
  const page = await loadPage(row.page_id);
  if (page) void invalidatePublishedPageCache(page.slug, page.workspaceId);

  return merged;
}

export async function deleteBlock(id: number) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT page_id FROM page_blocks WHERE id = ?", [id]);
  const pageId = rows[0]?.page_id;
  if (!pageId) return false;

  const result = await mysqlQuery<{ affectedRows: number }>("DELETE FROM page_blocks WHERE id = ?", [id]);
  if (!result.affectedRows) return false;

  const remaining = await mysqlQuery<BlockRow[]>("SELECT id FROM page_blocks WHERE page_id = ? ORDER BY sort_order ASC", [pageId]);
  await Promise.all(remaining.map((block, index) => mysqlQuery("UPDATE page_blocks SET sort_order = ? WHERE id = ?", [index + 1, block.id])));
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [pageId]);
  const page = await loadPage(pageId);
  if (page) void invalidatePublishedPageCache(page.slug, page.workspaceId);

  return true;
}

export async function duplicateBlock(id: number) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT * FROM page_blocks WHERE id = ?", [id]);
  const row = rows[0];
  if (!row) return null;

  const block = mapBlock(row);
  await mysqlQuery("UPDATE page_blocks SET sort_order = sort_order + 1 WHERE page_id = ? AND sort_order > ?", [row.page_id, block.sortOrder]);

  const result = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO page_blocks (workspace_id, page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      row.workspace_id,
      row.page_id,
      block.type,
      `${block.title} Copy`,
      block.subtitle,
      block.url,
      block.icon,
      block.phone,
      block.message,
      block.imageUrl,
      block.videoUrl,
      JSON.stringify(block.settings),
      block.sortOrder + 1,
      block.isActive,
    ],
  );
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [row.page_id]);

  return {
    ...block,
    id: result.insertId,
    title: `${block.title} Copy`,
    sortOrder: block.sortOrder + 1,
    clicks: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export async function reorderBlocks(pageId: number, blockIds: number[]) {
  const existing = await blocksForPage(pageId);
  if (!existing.length) return null;
  if (blockIds.length !== existing.length) throw new Error("Invalid block order");
  if (blockIds.some((blockId) => !existing.some((block) => block.id === blockId))) throw new Error("Invalid block order");

  await Promise.all(blockIds.map((blockId, index) => mysqlQuery("UPDATE page_blocks SET sort_order = ? WHERE id = ?", [index + 1, blockId])));
  await mysqlQuery("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [pageId]);

  return loadPage(pageId);
}

export async function trackView(
  slug: string,
  userAgent: string,
  referrer: string | null,
  visitorKey: string,
  country = '',
  city = '',
  location = '',
  workspaceId?: string,
  countryCode?: string,
  region?: string,
  regionCode?: string,
  geoSource?: string,
  ipHash?: string,
) {
  void location;
  const rows = await mysqlQuery<{ id: number; workspace_id: string }[]>(`SELECT id, workspace_id FROM pages WHERE slug = ? AND status = 'published'${workspaceId ? ' AND workspace_id = ?' : ''} LIMIT 1`, [slug, ...(workspaceId ? [workspaceId] : [])]);
  const row = rows[0];
  if (!row) return null;

  const hash = visitorHash(visitorKey);
  enqueuePageView({
    pageId: row.id,
    visitorHash: hash,
    deviceType: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    country: country || null,
    city: city || null,
    countryCode: countryCode || null,
    region: region || null,
    regionCode: regionCode || null,
    geoSource: geoSource || 'ip_geo',
    ipHash: ipHash || hash,
    workspaceId: row.workspace_id || workspaceId || 'default',
    isUnique: true,
  });

  return { ok: true };
}

export async function trackClick(
  pageId: number,
  blockId: number,
  userAgent: string,
  referrer: string | null,
  country = '',
  city = '',
  location = '',
  workspaceId?: string,
  countryCode?: string,
  region?: string,
  regionCode?: string,
  geoSource?: string,
  ipHash?: string,
) {
  void location;
  const rows = await mysqlQuery<{ id: number; workspace_id: string }[]>(`SELECT b.id, p.workspace_id FROM page_blocks b INNER JOIN pages p ON p.id = b.page_id WHERE b.id = ? AND b.page_id = ? AND p.status = 'published'${workspaceId ? ' AND p.workspace_id = ?' : ''} LIMIT 1`, [blockId, pageId, ...(workspaceId ? [workspaceId] : [])]);
  const row = rows[0];
  if (!row) return null;

  enqueueLinkClick({
    pageId,
    blockId,
    deviceType: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    country: country || null,
    city: city || null,
    countryCode: countryCode || null,
    region: region || null,
    regionCode: regionCode || null,
    geoSource: geoSource || 'ip_geo',
    ipHash: ipHash || null,
    workspaceId: row.workspace_id || workspaceId || 'default',
  });

  return { ok: true };
}

export async function trackCustomHtmlLinkClick(
  pageId: number,
  href: string,
  userAgent: string,
  referrer: string | null,
  country = '',
  city = '',
  location = '',
  workspaceId?: string,
  countryCode?: string,
  region?: string,
  regionCode?: string,
  geoSource?: string,
  ipHash?: string,
) {
  void location;
  const rows = await mysqlQuery<{ id: number; workspace_id: string }[]>(`SELECT id, workspace_id FROM pages WHERE id = ? AND page_type = 'custom_html' AND status = 'published'${workspaceId ? ' AND workspace_id = ?' : ''} LIMIT 1`, [pageId, ...(workspaceId ? [workspaceId] : [])]);
  const row = rows[0];
  if (!row) return null;

  enqueueCustomHtmlLinkClick({
    pageId,
    href,
    deviceType: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    country: country || null,
    city: city || null,
    countryCode: countryCode || null,
    region: region || null,
    regionCode: regionCode || null,
    geoSource: geoSource || 'ip_geo',
    ipHash: ipHash || null,
    workspaceId: row.workspace_id || workspaceId || 'default',
  });
  return { ok: true };
}

function normalizeGeoRecord(item: {
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  regionCode?: string | null;
  city?: string | null;
  location?: string | null;
  geoSource?: string | null;
}) {
  let country = (item.country || '').trim();
  let city = (item.city || '').trim();
  let region = (item.region || '').trim();
  let countryCode = (item.countryCode || '').trim().toUpperCase();
  let regionCode = (item.regionCode || '').trim();
  const geoSource = item.geoSource || (country && country !== 'Direct / Local' && country !== 'Direct' ? 'ip_geo' : 'unknown');

  if (!country || country === 'Direct / Local' || country === 'Direct' || country === 'Local') {
    country = 'Unknown';
    countryCode = '';
  }
  if (!city || city === 'Direct / Local' || city === 'Direct' || city === 'Local') {
    city = 'Unknown';
  }
  if (!region || region === 'Direct / Local' || region === 'Direct' || region === 'Local') {
    region = 'Unknown';
  }

  if (item.location && item.location !== 'Direct / Local' && item.location !== 'Unknown') {
    const parts = item.location.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      if (city === 'Unknown') city = parts[0];
      if (region === 'Unknown') region = parts[1];
      if (country === 'Unknown') country = parts[2];
    } else if (parts.length === 2) {
      if (city === 'Unknown') city = parts[0];
      if (country === 'Unknown') country = parts[1];
    } else if (parts.length === 1 && country === 'Unknown') {
      country = parts[0];
    }
  }

  let location = 'Unknown';
  if (city !== 'Unknown' && country !== 'Unknown') {
    if (region !== 'Unknown' && region !== city && region !== country) {
      location = `${city}, ${region}, ${country}`;
    } else {
      location = `${city}, ${country}`;
    }
  } else if (country !== 'Unknown') {
    location = country;
  }

  return { country, countryCode, region, regionCode, city, location, geoSource };
}

export async function analyticsForPage(
  pageId: number,
  daysInput: number | string = 30,
  fromDate?: string,
  toDate?: string,
): Promise<AnalyticsReport | null> {
  const page = await loadPage(pageId);
  if (!page) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  let days: string[] = [];
  let startDate = '';
  let endDate = todayStr;

  if (fromDate && toDate) {
    startDate = fromDate <= toDate ? fromDate : toDate;
    endDate = fromDate <= toDate ? toDate : fromDate;
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const diffDays = Math.min(366, Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1));
    days = Array.from({ length: diffDays }, (_, index) => {
      const d = new Date(startObj);
      d.setDate(d.getDate() + index);
      return d.toISOString().slice(0, 10);
    });
  } else if (daysInput === 'today') {
    startDate = todayStr;
    endDate = todayStr;
    days = [todayStr];
  } else if (daysInput === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    startDate = yStr;
    endDate = yStr;
    days = [yStr];
  } else if (daysInput === 'month') {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    startDate = firstDay;
    endDate = todayStr;
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const diffDays = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    days = Array.from({ length: diffDays }, (_, index) => {
      const d = new Date(startObj);
      d.setDate(d.getDate() + index);
      return d.toISOString().slice(0, 10);
    });
  } else {
    let numDays = 30;
    if (daysInput === 'all') numDays = 365;
    else if (typeof daysInput === 'number' && Number.isFinite(daysInput)) numDays = Math.max(1, Math.min(365, daysInput));
    else if (typeof daysInput === 'string') {
      const parsed = Number(daysInput);
      if (Number.isFinite(parsed)) numDays = Math.max(1, Math.min(365, parsed));
    }

    days = Array.from({ length: numDays }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (numDays - 1 - index));
      return date.toISOString().slice(0, 10);
    });
    startDate = days[0];
    endDate = days[days.length - 1];
  }

  const endDateTime = `${endDate} 23:59:59`;

  const dailyViews = await mysqlQuery<{ date: string | Date; count: number }[]>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM page_views
     WHERE page_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at)`,
    [pageId, startDate, endDateTime],
  );
  const dailyClicks = await mysqlQuery<{ date: string | Date; count: number }[]>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM link_clicks
     WHERE page_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at)`,
    [pageId, startDate, endDateTime],
  );
  const customHtmlDailyClicks = await mysqlQuery<{ date: string | Date; count: number }[]>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM custom_html_link_clicks WHERE page_id = ? AND created_at >= ? AND created_at <= ? GROUP BY DATE(created_at)`,
    [pageId, startDate, endDateTime],
  );
  const customHtmlLinks = await mysqlQuery<{ href: string; count: number }[]>(
    `SELECT href, COUNT(*) AS count FROM custom_html_link_clicks WHERE page_id = ? AND created_at >= ? AND created_at <= ? GROUP BY href ORDER BY count DESC`,
    [pageId, startDate, endDateTime],
  );
  const deviceRows = await mysqlQuery<{ device_type: string; count: number }[]>(
    `SELECT device_type, COUNT(*) AS count FROM page_views WHERE page_id = ? AND created_at >= ? AND created_at <= ? GROUP BY device_type`,
    [pageId, startDate, endDateTime],
  );
  const referrerRows = await mysqlQuery<{ referrer: string; count: number }[]>(
    `SELECT referrer, COUNT(*) AS count FROM page_views WHERE page_id = ? AND created_at >= ? AND created_at <= ? GROUP BY referrer`,
    [pageId, startDate, endDateTime],
  );

  const viewLocationRows = await mysqlQuery<{
    country: string | null;
    country_code: string | null;
    region: string | null;
    region_code: string | null;
    city: string | null;
    views: number;
    visitors: number;
  }[]>(
    `SELECT country, country_code, region, region_code, city,
            COUNT(*) AS views,
            COUNT(DISTINCT visitor_hash) AS visitors
     FROM page_views
     WHERE page_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY country, country_code, region, region_code, city`,
    [pageId, startDate, endDateTime],
  );

  const clickLocationRows = await mysqlQuery<{
    block_id: number;
    country: string | null;
    country_code: string | null;
    region: string | null;
    region_code: string | null;
    city: string | null;
    count: number;
  }[]>(
    `SELECT block_id, country, country_code, region, region_code, city,
            COUNT(*) AS count
     FROM link_clicks
     WHERE page_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY block_id, country, country_code, region, region_code, city`,
    [pageId, startDate, endDateTime],
  );

  const blockClickRows = await mysqlQuery<{ block_id: number; count: number }[]>(
    `SELECT block_id, COUNT(*) AS count FROM link_clicks WHERE page_id = ? AND created_at >= ? AND created_at <= ? GROUP BY block_id`,
    [pageId, startDate, endDateTime],
  );

  const uniqueVisitorsRow = await mysqlQuery<{ count: number }[]>(
    `SELECT COUNT(DISTINCT visitor_hash) AS count FROM page_views WHERE page_id = ? AND created_at >= ? AND created_at <= ?`,
    [pageId, startDate, endDateTime],
  );

  // Subscribers for this page
  const subscriberRows = await mysqlQuery<{ client_details: string | null }[]>(
    `SELECT client_details FROM push_subscriptions WHERE page_id = ? AND is_active = 1`,
    [pageId],
  );

  const viewsByDate = new Map(dailyViews.map((row) => [toDateKey(row.date), Number(row.count)]));
  const clicksByDate = new Map(dailyClicks.map((row) => [toDateKey(row.date), Number(row.count)]));
  for (const row of customHtmlDailyClicks) {
    const date = toDateKey(row.date);
    clicksByDate.set(date, (clicksByDate.get(date) || 0) + Number(row.count));
  }
  const blockClicksMap = new Map(blockClickRows.map(row => [row.block_id, Number(row.count)]));

  const totalViews = daysInput === 'all' && !fromDate ? page.views : dailyViews.reduce((sum, r) => sum + Number(r.count), 0);
  const totalClicks = daysInput === 'all' && !fromDate
    ? page.blocks.reduce((sum, block) => sum + block.clicks, 0) + Number((await mysqlQuery<{ count: number }[]>('SELECT COUNT(*) AS count FROM custom_html_link_clicks WHERE page_id = ?', [pageId]))[0]?.count ?? 0)
    : [...clicksByDate.values()].reduce((sum, count) => sum + count, 0);

  const uniqueVisitors = daysInput === 'all' && !fromDate ? page.uniqueVisitors : Number(uniqueVisitorsRow[0]?.count || 0);
  const returningVisitors = Math.max(0, totalViews - uniqueVisitors);
  const totalSubscribers = subscriberRows.length;
  const subscriptionRate = totalViews > 0 ? Number(((totalSubscribers / totalViews) * 100).toFixed(1)) : 0;

  // Geographic Hierarchy Accumulators
  type CityAcc = {
    city: string;
    region: string;
    country: string;
    location: string;
    views: number;
    clicks: number;
    subscribers: number;
    visitors: number;
    links: Map<number, { blockId: number; blockTitle: string; clicks: number }>;
  };

  type RegionAcc = {
    regionCode: string;
    regionName: string;
    countryName: string;
    views: number;
    clicks: number;
    subscribers: number;
    visitors: number;
    cities: Map<string, CityAcc>;
  };

  type CountryAcc = {
    countryCode: string;
    countryName: string;
    views: number;
    clicks: number;
    subscribers: number;
    visitors: number;
    regions: Map<string, RegionAcc>;
    cities: Map<string, CityAcc>;
  };

  const countriesAcc = new Map<string, CountryAcc>();
  const regionsAcc = new Map<string, RegionAcc>();
  const flatCitiesAcc = new Map<string, CityAcc>();

  function getOrInitCountry(geo: ReturnType<typeof normalizeGeoRecord>): CountryAcc {
    let cItem = countriesAcc.get(geo.country);
    if (!cItem) {
      cItem = {
        countryCode: geo.countryCode,
        countryName: geo.country,
        views: 0,
        clicks: 0,
        subscribers: 0,
        visitors: 0,
        regions: new Map(),
        cities: new Map(),
      };
      countriesAcc.set(geo.country, cItem);
    }
    if (!cItem.countryCode && geo.countryCode) {
      cItem.countryCode = geo.countryCode;
    }
    return cItem;
  }

  function getOrInitRegion(cItem: CountryAcc, geo: ReturnType<typeof normalizeGeoRecord>): RegionAcc {
    const regKey = `${cItem.countryName}:${geo.region}`;
    let rItem = cItem.regions.get(geo.region);
    if (!rItem) {
      rItem = {
        regionCode: geo.regionCode,
        regionName: geo.region,
        countryName: cItem.countryName,
        views: 0,
        clicks: 0,
        subscribers: 0,
        visitors: 0,
        cities: new Map(),
      };
      cItem.regions.set(geo.region, rItem);
      regionsAcc.set(regKey, rItem);
    }
    return rItem;
  }

  function getOrInitCity(cItem: CountryAcc, rItem: RegionAcc, geo: ReturnType<typeof normalizeGeoRecord>): CityAcc {
    const cityKey = `${cItem.countryName}:${geo.region}:${geo.city}`;
    let ctItem = cItem.cities.get(geo.city);
    if (!ctItem) {
      ctItem = {
        city: geo.city,
        region: geo.region,
        country: geo.country,
        location: geo.location,
        views: 0,
        clicks: 0,
        subscribers: 0,
        visitors: 0,
        links: new Map(),
      };
      cItem.cities.set(geo.city, ctItem);
      rItem.cities.set(geo.city, ctItem);
      flatCitiesAcc.set(cityKey, ctItem);
    }
    return ctItem;
  }

  for (const row of viewLocationRows) {
    const geo = normalizeGeoRecord({
      country: row.country,
      countryCode: row.country_code,
      region: row.region,
      regionCode: row.region_code,
      city: row.city,
    });
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);

    const vCount = Number(row.views || 0);
    const visCount = Number(row.visitors || 0);

    cItem.views += vCount;
    cItem.visitors += visCount;

    rItem.views += vCount;
    rItem.visitors += visCount;

    ctItem.views += vCount;
    ctItem.visitors += visCount;
  }

  for (const row of clickLocationRows) {
    const geo = normalizeGeoRecord({
      country: row.country,
      countryCode: row.country_code,
      region: row.region,
      regionCode: row.region_code,
      city: row.city,
    });
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);

    const cCount = Number(row.count || 0);
    cItem.clicks += cCount;
    rItem.clicks += cCount;
    ctItem.clicks += cCount;

    const block = page.blocks.find(b => b.id === row.block_id);
    const blockTitle = block?.title || `Block #${row.block_id}`;
    const linkItem = ctItem.links.get(row.block_id) || { blockId: row.block_id, blockTitle, clicks: 0 };
    linkItem.clicks += cCount;
    ctItem.links.set(row.block_id, linkItem);
  }

  for (const sub of subscriberRows) {
    let details: Partial<SubscriberDetails> = {};
    if (sub.client_details) {
      try { details = JSON.parse(sub.client_details); } catch { /* ignore */ }
    }
    const geo = normalizeGeoRecord({
      country: details.countryName || details.country,
      countryCode: details.countryCode,
      region: details.regionName || details.region,
      regionCode: details.regionCode,
      city: details.city,
    });
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);

    cItem.subscribers += 1;
    rItem.subscribers += 1;
    ctItem.subscribers += 1;
  }

  const countriesResult: CountryDetailMetric[] = [...countriesAcc.values()].map(c => {
    const regionsList: RegionDetailMetric[] = [...c.regions.values()].map(r => {
      const citiesList: CityDetailMetric[] = [...r.cities.values()].map(ct => ({
        city: ct.city,
        region: ct.region,
        country: ct.country,
        location: ct.location,
        views: ct.views,
        visitors: ct.visitors,
        clicks: ct.clicks,
        subscribers: ct.subscribers,
        ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
        viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
        visitorShare: uniqueVisitors > 0 ? Number(((ct.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
        topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
      })).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

      return {
        regionCode: r.regionCode,
        regionName: r.regionName,
        countryName: r.countryName,
        views: r.views,
        visitors: r.visitors,
        clicks: r.clicks,
        subscribers: r.subscribers,
        ctr: r.views > 0 ? Number(((r.clicks / r.views) * 100).toFixed(1)) : (r.clicks > 0 ? 100 : 0),
        viewShare: totalViews > 0 ? Number(((r.views / totalViews) * 100).toFixed(1)) : 0,
        visitorShare: uniqueVisitors > 0 ? Number(((r.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
        cities: citiesList,
      };
    }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    const allCitiesInCountry: CityDetailMetric[] = [...c.cities.values()].map(ct => ({
      city: ct.city,
      region: ct.region,
      country: ct.country,
      location: ct.location,
      views: ct.views,
      visitors: ct.visitors,
      clicks: ct.clicks,
      subscribers: ct.subscribers,
      ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((ct.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
    })).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    return {
      countryCode: c.countryCode,
      countryName: c.countryName,
      views: c.views,
      visitors: c.visitors,
      clicks: c.clicks,
      subscribers: c.subscribers,
      ctr: c.views > 0 ? Number(((c.clicks / c.views) * 100).toFixed(1)) : (c.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((c.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((c.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      regions: regionsList,
      cities: allCitiesInCountry,
    };
  }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  const regionsResult: RegionDetailMetric[] = [...regionsAcc.values()].map(r => {
    const citiesList: CityDetailMetric[] = [...r.cities.values()].map(ct => ({
      city: ct.city,
      region: ct.region,
      country: ct.country,
      location: ct.location,
      views: ct.views,
      visitors: ct.visitors,
      clicks: ct.clicks,
      subscribers: ct.subscribers,
      ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((ct.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
    })).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    return {
      regionCode: r.regionCode,
      regionName: r.regionName,
      countryName: r.countryName,
      views: r.views,
      visitors: r.visitors,
      clicks: r.clicks,
      subscribers: r.subscribers,
      ctr: r.views > 0 ? Number(((r.clicks / r.views) * 100).toFixed(1)) : (r.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((r.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((r.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      cities: citiesList,
    };
  }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  const flatLocationsResult: LocationMetric[] = [...flatCitiesAcc.values()].map(ct => ({
    location: ct.location,
    country: ct.country,
    region: ct.region,
    city: ct.city,
    views: ct.views,
    visitors: ct.visitors,
    clicks: ct.clicks,
    subscribers: ct.subscribers,
    ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
    viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
    visitorShare: uniqueVisitors > 0 ? Number(((ct.visitors / uniqueVisitors) * 100).toFixed(1)) : 0,
  })).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  const linkLocationsMap = new Map<string, { blockId: number; blockTitle: string; location: string; country: string; city: string; clicks: number }>();
  for (const row of clickLocationRows) {
    const block = page.blocks.find(b => b.id === row.block_id);
    const blockTitle = block?.title || `Block #${row.block_id}`;
    const geo = normalizeGeoRecord({
      country: row.country,
      countryCode: row.country_code,
      region: row.region,
      regionCode: row.region_code,
      city: row.city,
    });
    const key = `${row.block_id}:${geo.location}`;
    const current = linkLocationsMap.get(key) || { blockId: row.block_id, blockTitle, location: geo.location, country: geo.country, city: geo.city, clicks: 0 };
    current.clicks += Number(row.count || 0);
    linkLocationsMap.set(key, current);
  }

  return {
    views: totalViews,
    uniqueVisitors,
    returningVisitors,
    clicks: totalClicks,
    ctr: totalViews ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0,
    subscribers: totalSubscribers,
    subscriptionRate,
    topBlocks: [...page.blocks]
      .map((block) => ({ id: block.id, title: block.title, clicks: blockClicksMap.get(block.id) ?? block.clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5),
    daily: days.map((date) => ({
      date,
      views: viewsByDate.get(date) ?? 0,
      clicks: clicksByDate.get(date) ?? 0,
    })),
    devices: ["mobile", "desktop", "tablet"].map((device) => {
      const count = Number(deviceRows.find((row) => row.device_type === device)?.count ?? 0);
      return {
        device,
        count,
        percentage: totalViews > 0 ? Number(((count / totalViews) * 100).toFixed(1)) : 0,
      };
    }),
    referrers: referrerRows.map((row) => ({
      referrer: row.referrer,
      count: Number(row.count),
      percentage: totalViews > 0 ? Number(((Number(row.count) / totalViews) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.count - a.count),
    locations: flatLocationsResult,
    regions: regionsResult,
    linkLocations: [...linkLocationsMap.values()].sort((a, b) => b.clicks - a.clicks),
    countries: countriesResult,
    customHtmlLinks: customHtmlLinks.map((row): CustomHtmlLinkMetric => ({ href: row.href, clicks: Number(row.count) })),
    days: daysInput,
    startDate,
    endDate,
  };
}

export async function savePushSubscription(slug: string, subscription: PushSubscriptionRecord, userAgent: string, details?: SubscriberDetails, workspaceId?: string) {
  await ensurePushTable();
  const rows = await mysqlQuery<{ id: number; workspace_id: string }[]>(`SELECT id, workspace_id FROM pages WHERE slug = ? AND status = 'published'${workspaceId ? ' AND workspace_id = ?' : ''}`, [slug, ...(workspaceId ? [workspaceId] : [])]);
  const pageId = rows[0]?.id;
  if (!pageId) return null;

  const endpointHash = subscriptionHash(subscription.endpoint);
  await mysqlQuery(
    `INSERT INTO push_subscriptions (workspace_id, page_id, endpoint_hash, subscription_json, user_agent, client_details, is_active, last_failed_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NULL)
     ON DUPLICATE KEY UPDATE page_id = VALUES(page_id), subscription_json = VALUES(subscription_json), user_agent = VALUES(user_agent), client_details = COALESCE(VALUES(client_details), client_details), is_active = 1, last_failed_at = NULL`,
    [rows[0].workspace_id, pageId, endpointHash, JSON.stringify(subscription), userAgent.slice(0, 500), details ? JSON.stringify(details) : null],
  );

  const saved = await mysqlQuery<PushRow[]>(
    `SELECT ps.*, p.slug FROM push_subscriptions ps
     INNER JOIN pages p ON p.id = ps.page_id
     WHERE ps.endpoint_hash = ? AND ps.workspace_id = ?`,
    [endpointHash, rows[0].workspace_id],
  );
  const row = saved[0];
  if (!row) return null;
  return {
    id: row.id,
    pageId: row.page_id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    endpointHash: row.endpoint_hash,
    subscription: toJson<PushSubscriptionRecord>(row.subscription_json, subscription),
    userAgent: row.user_agent ?? "",
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    lastFailedAt: row.last_failed_at ? toIso(row.last_failed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listPushSubscribers(workspaceId?: string): Promise<NotificationSubscriberSummary> {
  await ensurePushTable();
  // Subscribers stay scoped to their page, and so to that page's workspace.
  const scope = workspaceId ? 'AND p.workspace_id = ?' : '';
  const scopeValues = workspaceId ? [workspaceId] : [];
  const rows = await mysqlQuery<{ page_id: number; slug: string; subscribers: number }[]>(
    `SELECT ps.page_id, p.slug, COUNT(*) AS subscribers
     FROM push_subscriptions ps
     INNER JOIN pages p ON p.id = ps.page_id
     WHERE ps.is_active = 1 ${scope}
     GROUP BY ps.page_id, p.slug
     ORDER BY subscribers DESC`,
    scopeValues,
  );
  const totals = await mysqlQuery<{ inactive: number }[]>(
    `SELECT COUNT(*) AS inactive FROM push_subscriptions ps
     INNER JOIN pages p ON p.id = ps.page_id
     WHERE ps.is_active = 0 ${scope}`,
    scopeValues,
  );
  const recent = await mysqlQuery<Pick<PushRow, 'id' | 'page_id' | 'slug' | 'user_agent' | 'client_details' | 'is_active' | 'last_failed_at' | 'created_at'>[]>(
    `SELECT ps.id, ps.page_id, p.slug, ps.user_agent, ps.client_details, ps.is_active, ps.last_failed_at, ps.created_at
     FROM push_subscriptions ps INNER JOIN pages p ON p.id = ps.page_id
     WHERE 1 = 1 ${scope} ORDER BY ps.id DESC LIMIT 100`,
    scopeValues,
  );
  return {
    total: rows.reduce((sum, row) => sum + Number(row.subscribers), 0),
    inactive: Number(totals[0]?.inactive ?? 0),
    byPage: rows.map((row) => ({ pageId: row.page_id, slug: row.slug, subscribers: Number(row.subscribers) })),
    recent: recent.map(row => subscriberListItem({ id: Number(row.id), pageId: Number(row.page_id), slug: row.slug, userAgent: row.user_agent || '', isActive: row.is_active == null ? true : Boolean(row.is_active), lastFailedAt: row.last_failed_at ? toIso(row.last_failed_at) : null, createdAt: toIso(row.created_at), details: toJson<Partial<SubscriberDetails>>(row.client_details, {}) })),
  };
}

function mapCampaign(row: CampaignRow): NotificationCampaign {
  return {
    id: Number(row.id),
    workspaceId: row.workspace_id,
    name: row.title,
    status: (Number(row.sent) > 0 || Number(row.attempted) > 0) ? 'completed' : 'draft',
    pageId: row.page_id == null ? null : Number(row.page_id),
    pageSlug: row.page_slug,
    title: row.title,
    body: row.body,
    url: row.url,
    audience: row.audience,
    attempted: Number(row.attempted),
    sent: Number(row.sent),
    delivered: Number(row.delivered),
    seen: Number(row.seen),
    clicked: Number(row.clicked),
    clicks: Number(row.clicked),
    failed: Number(row.failed),
    removed: Number(row.removed),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listNotificationCampaigns(workspaceId?: string): Promise<NotificationCampaign[]> {
  await ensureCampaignTable();
  const rows = await mysqlQuery<CampaignRow[]>(
    `SELECT * FROM notification_campaigns
     ${workspaceId ? 'WHERE workspace_id = ?' : ''}
     ORDER BY created_at DESC
     LIMIT 100`,
    workspaceId ? [workspaceId] : [],
  );
  return rows.map(mapCampaign);
}

export async function getNotificationCampaignById(id: number, workspaceId?: string): Promise<NotificationCampaign | null> {
  await ensureCampaignTable();
  const rows = await mysqlQuery<CampaignRow[]>(
    `SELECT * FROM notification_campaigns WHERE id = ? ${workspaceId ? 'AND workspace_id = ?' : ''}`,
    workspaceId ? [id, workspaceId] : [id],
  );
  return rows[0] ? mapCampaign(rows[0]) : null;
}

export async function createNotificationCampaign(input: NotificationSendInput): Promise<NotificationCampaign> {
  await ensureCampaignTable();
  const inserted = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO notification_campaigns (workspace_id, page_id, page_slug, title, body, url, audience, attempted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [input.workspaceId || DEFAULT_WORKSPACE_ID, input.pageId ?? null, null, input.title.trim().slice(0, 120), input.body.trim().slice(0, 255), (input.url.trim() || '/').slice(0, 700), input.name || 'Targeted'],
  );
  const campaignId = Number(inserted.insertId);
  const rows = await mysqlQuery<CampaignRow[]>('SELECT * FROM notification_campaigns WHERE id = ?', [campaignId]);
  if (!rows[0]) throw new Error("Campaign could not be created.");
  return mapCampaign(rows[0]);
}

export async function updateNotificationCampaign(id: number, patch: Partial<NotificationCampaign>, workspaceId?: string): Promise<NotificationCampaign | null> {
  await ensureCampaignTable();
  if (patch.title || patch.body || patch.url) {
    await mysqlQuery(
      `UPDATE notification_campaigns SET title = COALESCE(?, title), body = COALESCE(?, body), url = COALESCE(?, url) WHERE id = ? ${workspaceId ? 'AND workspace_id = ?' : ''}`,
      [patch.title ?? null, patch.body ?? null, patch.url ?? null, id, ...(workspaceId ? [workspaceId] : [])],
    );
  }
  return getNotificationCampaignById(id, workspaceId);
}

export async function deleteNotificationCampaign(id: number, workspaceId?: string): Promise<boolean> {
  await ensureCampaignTable();
  const result = await mysqlQuery<{ affectedRows: number }>(
    `DELETE FROM notification_campaigns WHERE id = ? ${workspaceId ? 'AND workspace_id = ?' : ''}`,
    workspaceId ? [id, workspaceId] : [id],
  );
  return Number(result.affectedRows) > 0;
}

export async function listNotificationHistory(
  workspaceId?: string,
  filters?: { campaignId?: number; limit?: number; offset?: number; search?: string }
): Promise<{ items: import('../types').NotificationDeliveryLog[]; total: number }> {
  // MySQL fallback: returns recent campaign activity logs
  const campaigns = await listNotificationCampaigns(workspaceId);
  const items: import('../types').NotificationDeliveryLog[] = campaigns.map(c => ({
    id: `log-${c.id}`,
    campaignId: c.id,
    campaignName: c.name || c.title,
    subscriberId: 1,
    country: 'Various',
    city: 'Various',
    device: 'Desktop/Mobile',
    browser: 'Browser',
    status: c.delivered > 0 ? 'delivered' : c.failed > 0 ? 'failed' : 'sent',
    sentAt: c.createdAt,
  }));
  return { items, total: items.length };
}

type SubscriberSegmentRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  filters: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type NotificationTemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  category: NotificationTemplate["category"] | null;
  title: string;
  body: string;
  url: string | null;
  icon: string | null;
  image: string | null;
  badge: string | null;
  cta_text: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapSubscriberSegment(row: SubscriberSegmentRow, subscriberCount?: number): SubscriberSegment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description || "",
    filters: toJson<AudienceFilters>(row.filters, {}),
    subscriberCount,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapNotificationTemplate(row: NotificationTemplateRow): NotificationTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    category: row.category || "custom",
    title: row.title,
    body: row.body,
    url: row.url || "/",
    icon: row.icon,
    image: row.image,
    badge: row.badge,
    ctaText: row.cta_text,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeSubscriberDetails(details: Partial<SubscriberDetails>): SubscriberDetails {
  return {
    device: details.device || "Desktop",
    browser: details.browser || "Browser",
    ipAddress: details.ipAddress || "",
    country: details.country || details.countryName || "Unknown",
    countryCode: details.countryCode,
    countryName: details.countryName,
    region: details.region || details.regionName || "",
    regionCode: details.regionCode,
    regionName: details.regionName,
    city: details.city || "Unknown",
    timezone: details.timezone || "",
    lastActiveAt: details.lastActiveAt,
    source: details.source,
    utmSource: details.utmSource,
    utmCampaign: details.utmCampaign,
    totalSent: details.totalSent,
    totalClicks: details.totalClicks,
  };
}

async function workspaceSubscribers(workspaceId: string) {
  await ensurePushTable();
  const rows = await mysqlQuery<PushRow[]>(
    `SELECT ps.*, p.slug FROM push_subscriptions ps
     INNER JOIN pages p ON p.id = ps.page_id
     WHERE ps.workspace_id = ? AND ps.is_active = 1`,
    [workspaceId],
  );
  return rows.map(row => ({
    id: Number(row.id),
    pageId: Number(row.page_id),
    workspaceId: row.workspace_id,
    slug: row.slug,
    endpointHash: row.endpoint_hash,
    subscription: toJson<PushSubscriptionRecord>(row.subscription_json, { endpoint: "", keys: { p256dh: "", auth: "" } }),
    userAgent: row.user_agent || "",
    details: normalizeSubscriberDetails(toJson<Partial<SubscriberDetails>>(row.client_details, {})),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    lastFailedAt: row.last_failed_at ? toIso(row.last_failed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));
}

export async function listSubscriberSegments(workspaceId: string): Promise<SubscriberSegment[]> {
  const rows = await mysqlQuery<SubscriberSegmentRow[]>(
    "SELECT * FROM subscriber_segments WHERE workspace_id = ? ORDER BY updated_at DESC",
    [workspaceId],
  );
  const subscribers = await workspaceSubscribers(workspaceId);
  return rows.map(row => {
    const segment = mapSubscriberSegment(row);
    return { ...segment, subscriberCount: subscribers.filter(s => matchSubscriber(s, segment.filters)).length };
  });
}

export async function saveSubscriberSegment(segment: Partial<SubscriberSegment> & { name: string; filters: AudienceFilters; workspaceId: string }): Promise<SubscriberSegment> {
  const id = segment.id || randomUUID();
  await mysqlQuery(
    `INSERT INTO subscriber_segments (id, workspace_id, name, description, filters)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       filters = VALUES(filters),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      segment.workspaceId,
      segment.name.trim().slice(0, 120),
      segment.description?.trim().slice(0, 500) || null,
      JSON.stringify(segment.filters || {}),
    ],
  );
  const rows = await mysqlQuery<SubscriberSegmentRow[]>("SELECT * FROM subscriber_segments WHERE id = ? AND workspace_id = ?", [id, segment.workspaceId]);
  if (!rows[0]) throw new Error("Segment could not be saved.");
  const subscribers = await workspaceSubscribers(segment.workspaceId);
  const saved = mapSubscriberSegment(rows[0]);
  return { ...saved, subscriberCount: subscribers.filter(s => matchSubscriber(s, saved.filters)).length };
}

export async function deleteSubscriberSegment(id: string, workspaceId: string): Promise<boolean> {
  const result = await mysqlQuery<{ affectedRows: number }>("DELETE FROM subscriber_segments WHERE id = ? AND workspace_id = ?", [id, workspaceId]);
  return Number(result.affectedRows) > 0;
}

export async function listNotificationTemplates(workspaceId: string): Promise<NotificationTemplate[]> {
  let rows = await mysqlQuery<NotificationTemplateRow[]>(
    "SELECT * FROM notification_templates WHERE workspace_id = ? ORDER BY updated_at DESC",
    [workspaceId],
  );
  if (!rows.length) {
    for (const template of seedTemplates(workspaceId)) {
      await saveNotificationTemplate(template);
    }
    rows = await mysqlQuery<NotificationTemplateRow[]>(
      "SELECT * FROM notification_templates WHERE workspace_id = ? ORDER BY updated_at DESC",
      [workspaceId],
    );
  }
  return rows.map(mapNotificationTemplate);
}

export async function saveNotificationTemplate(template: Partial<NotificationTemplate> & { name: string; title: string; body: string; workspaceId: string }): Promise<NotificationTemplate> {
  const id = template.id || randomUUID();
  await mysqlQuery(
    `INSERT INTO notification_templates (id, workspace_id, name, category, title, body, url, icon, image, badge, cta_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       category = VALUES(category),
       title = VALUES(title),
       body = VALUES(body),
       url = VALUES(url),
       icon = VALUES(icon),
       image = VALUES(image),
       badge = VALUES(badge),
       cta_text = VALUES(cta_text),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      template.workspaceId,
      template.name.trim().slice(0, 120),
      template.category || "custom",
      template.title.trim().slice(0, 120),
      template.body.trim().slice(0, 255),
      (template.url || "/").slice(0, 700),
      template.icon || null,
      template.image || null,
      template.badge || null,
      template.ctaText || null,
    ],
  );
  const rows = await mysqlQuery<NotificationTemplateRow[]>("SELECT * FROM notification_templates WHERE id = ? AND workspace_id = ?", [id, template.workspaceId]);
  if (!rows[0]) throw new Error("Template could not be saved.");
  return mapNotificationTemplate(rows[0]);
}

export async function deleteNotificationTemplate(id: string, workspaceId: string): Promise<boolean> {
  const result = await mysqlQuery<{ affectedRows: number }>("DELETE FROM notification_templates WHERE id = ? AND workspace_id = ?", [id, workspaceId]);
  return Number(result.affectedRows) > 0;
}

export async function trackNotificationCampaignClick(campaignId: number) {
  return Boolean(await recordNotificationCampaignEvent(campaignId, 'clicked'));
}

export async function sendPushNotification(input: NotificationSendInput): Promise<NotificationSendResult> {
  configureWebPush();
  await ensurePushTable();
  await ensureCampaignTable();
  const rows = await mysqlQuery<PushRow[]>(
    `SELECT ps.*, p.slug FROM push_subscriptions ps
     INNER JOIN pages p ON p.id = ps.page_id
     WHERE ps.is_active = 1 AND (? IS NULL OR ps.page_id = ?) AND (? IS NULL OR p.workspace_id = ?)`,
    [input.pageId ?? null, input.pageId ?? null, input.workspaceId ?? null, input.workspaceId ?? null],
  );
  const subscriptions = rows.map(row => toJson<PushSubscriptionRecord>(row.subscription_json, { endpoint: "", keys: { p256dh: "", auth: "" } }));
  const pageSlug = input.pageId ? rows.find(row => row.page_id === input.pageId)?.slug ?? null : null;
  const audience = input.pageId && pageSlug ? `/${pageSlug}` : 'All subscribers';
  const inserted = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO notification_campaigns (workspace_id, page_id, page_slug, title, body, url, audience, attempted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.workspaceId || DEFAULT_WORKSPACE_ID, input.pageId ?? null, pageSlug, input.title.trim().slice(0, 120), input.body.trim().slice(0, 255), (input.url.trim() || '/').slice(0, 700), audience, subscriptions.length],
  );
  const campaignId = Number(inserted.insertId);
  const { result, expired } = await sendPushBatch(subscriptions, notificationPayload({ ...input, campaignId }));
  if (expired.length) {
    const hashes = expired.map(subscriptionHash);
    await mysqlQuery(`UPDATE push_subscriptions SET is_active = 0, last_failed_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND endpoint_hash IN (${hashes.map(() => '?').join(',')})`, [input.workspaceId || DEFAULT_WORKSPACE_ID, ...hashes]);
  }
  await mysqlQuery(
    `UPDATE notification_campaigns
     SET attempted = ?, sent = ?, removed = ?, failed = ?
     WHERE id = ?`,
    [result.attempted, result.sent, result.removed, result.failed, campaignId],
  );
  const campaigns = await mysqlQuery<CampaignRow[]>('SELECT * FROM notification_campaigns WHERE id = ?', [campaignId]);
  if (!campaigns[0]) throw new Error("Campaign could not be created.");

  return { ...result, campaignId, campaign: campaigns[0] ? mapCampaign(campaigns[0]) : undefined };
}

export async function recordNotificationCampaignEvent(campaignId: number, event: 'delivered' | 'seen' | 'clicked') {
  if (!Number.isFinite(campaignId)) return null;
  await ensureCampaignTable();
  const column = event === 'clicked' ? 'clicked' : event === 'seen' ? 'seen' : 'delivered';
  await mysqlQuery(`UPDATE notification_campaigns SET ${column} = ${column} + 1 WHERE id = ?`, [campaignId]);
  const rows = await mysqlQuery<CampaignRow[]>('SELECT * FROM notification_campaigns WHERE id = ?', [campaignId]);
  return rows[0] ? mapCampaign(rows[0]) : null;
}
