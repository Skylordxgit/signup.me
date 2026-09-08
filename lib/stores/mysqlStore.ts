import { createHash } from "crypto";
import type { AnalyticsReport, BlockType, PageBlock, PageStatus, PushCampaign, SmartPage } from "../types";
import { defaultTheme } from "../defaults";
import { detectDevice, emptyBlock, isValidSlug, isValidUrl, nowIso, safeReferrer, slugify } from "../utils";
import { mysqlQuery, withTransaction } from "../mysql";

type PageRow = {
  id: number;
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

function mapPage(row: PageRow, blocks: PageBlock[]): SmartPage {
  return {
    id: row.id,
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
  };
}

async function blocksForPage(pageId: number) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT * FROM page_blocks WHERE page_id = ?", [pageId]);
  return rows.map(mapBlock);
}

async function loadPage(pageId: number) {
  const rows = await mysqlQuery<PageRow[]>("SELECT * FROM pages WHERE id = ?", [pageId]);
  if (!rows[0]) return null;
  return mapPage(rows[0], await blocksForPage(pageId));
}

function visitorHash(visitorKey: string) {
  return createHash("sha256").update(visitorKey).digest("hex");
}

export async function listPages() {
  const rows = await mysqlQuery<(PageRow & { clicks: number })[]>(
    `SELECT p.*, COALESCE(SUM(b.clicks), 0) AS clicks
     FROM pages p
     LEFT JOIN page_blocks b ON b.page_id = p.id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
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
  }));
}

export async function getPageById(id: number) {
  return loadPage(id);
}

export async function getPublicPageBySlug(slug: string) {
  const rows = await mysqlQuery<PageRow[]>("SELECT * FROM pages WHERE slug = ? AND status = 'published'", [slug]);
  if (!rows[0]) return null;
  return mapPage(rows[0], await blocksForPage(rows[0].id));
}

export async function createPage(input: {
  name: string;
  slug: string;
  title: string;
  bio: string;
  profileImage: string;
}) {
  const slug = slugify(input.slug || input.name);
  if (!isValidSlug(slug)) throw new Error("Invalid slug");
  if (input.profileImage && !isValidUrl(input.profileImage)) throw new Error("Invalid profile image URL");

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
    `INSERT INTO pages (name, slug, title, bio, profile_image, logo_image, status, theme_settings, seo_settings, integration_settings, views, unique_visitors)
     VALUES (?, ?, ?, ?, ?, '', 'published', ?, ?, ?, 0, 0)`,
    [
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
  return page;
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

  return loadPage(id);
}

export async function deletePage(id: number) {
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
      `INSERT INTO pages (name, slug, title, bio, profile_image, logo_image, status, theme_settings, seo_settings, integration_settings, views, unique_visitors)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, 0)`,
      [
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

    for (const block of page.blocks) {
      await query(
        `INSERT INTO page_blocks (page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
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

  return loadPage(newId);
}

export async function createBlock(pageId: number, type: BlockType) {
  const page = await loadPage(pageId);
  if (!page) return null;

  const block = emptyBlock(pageId, type, page.blocks.length + 1);
  const result = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO page_blocks (page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
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

  return { ...block, id: result.insertId };
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

  return true;
}

export async function duplicateBlock(id: number) {
  const rows = await mysqlQuery<BlockRow[]>("SELECT * FROM page_blocks WHERE id = ?", [id]);
  const row = rows[0];
  if (!row) return null;

  const block = mapBlock(row);
  await mysqlQuery("UPDATE page_blocks SET sort_order = sort_order + 1 WHERE page_id = ? AND sort_order > ?", [row.page_id, block.sortOrder]);

  const result = await mysqlQuery<{ insertId: number }>(
    `INSERT INTO page_blocks (page_id, type, title, subtitle, url, icon, phone, message, image_url, video_url, settings, sort_order, is_active, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
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

export async function trackView(slug: string, userAgent: string, referrer: string | null, visitorKey: string) {
  const rows = await mysqlQuery<{ id: number }[]>("SELECT id FROM pages WHERE slug = ? AND status = 'published'", [slug]);
  const pageId = rows[0]?.id;
  if (!pageId) return null;

  const hash = visitorHash(visitorKey);
  const seen = await mysqlQuery<{ id: number }[]>("SELECT id FROM page_views WHERE page_id = ? AND visitor_hash = ? LIMIT 1", [pageId, hash]);
  const isNewVisitor = seen.length === 0;

  await mysqlQuery(
    "UPDATE pages SET views = views + 1, unique_visitors = unique_visitors + ? WHERE id = ?",
    [isNewVisitor ? 1 : 0, pageId],
  );
  await mysqlQuery(
    "INSERT INTO page_views (page_id, visitor_hash, device_type, referrer) VALUES (?, ?, ?, ?)",
    [pageId, hash, detectDevice(userAgent), safeReferrer(referrer)],
  );

  return { ok: true };
}

export async function trackClick(pageId: number, blockId: number, userAgent: string, referrer: string | null) {
  const rows = await mysqlQuery<{ id: number }[]>("SELECT id FROM page_blocks WHERE id = ? AND page_id = ?", [blockId, pageId]);
  if (!rows.length) return null;

  await mysqlQuery("UPDATE page_blocks SET clicks = clicks + 1 WHERE id = ?", [blockId]);
  await mysqlQuery(
    "INSERT INTO link_clicks (page_id, block_id, device_type, referrer) VALUES (?, ?, ?, ?)",
    [pageId, blockId, detectDevice(userAgent), safeReferrer(referrer)],
  );

  return { ok: true };
}

export async function analyticsForPage(pageId: number): Promise<AnalyticsReport | null> {
  const page = await loadPage(pageId);
  if (!page) return null;

  const clicks = page.blocks.reduce((sum, block) => sum + block.clicks, 0);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });

  const dailyViews = await mysqlQuery<{ date: string | Date; count: number }[]>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM page_views
     WHERE page_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY DATE(created_at)`,
    [pageId],
  );
  const dailyClicks = await mysqlQuery<{ date: string | Date; count: number }[]>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM link_clicks
     WHERE page_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY DATE(created_at)`,
    [pageId],
  );
  const deviceRows = await mysqlQuery<{ device_type: string; count: number }[]>(
    "SELECT device_type, COUNT(*) AS count FROM page_views WHERE page_id = ? GROUP BY device_type",
    [pageId],
  );
  const referrerRows = await mysqlQuery<{ referrer: string; count: number }[]>(
    "SELECT referrer, COUNT(*) AS count FROM page_views WHERE page_id = ? GROUP BY referrer",
    [pageId],
  );

  const viewsByDate = new Map(dailyViews.map((row) => [toDateKey(row.date), Number(row.count)]));
  const clicksByDate = new Map(dailyClicks.map((row) => [toDateKey(row.date), Number(row.count)]));

  return {
    views: page.views,
    uniqueVisitors: page.uniqueVisitors,
    clicks,
    ctr: page.views ? Number(((clicks / page.views) * 100).toFixed(1)) : 0,
    topBlocks: [...page.blocks]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map((block) => ({ id: block.id, title: block.title, clicks: block.clicks })),
    daily: days.map((date) => ({
      date,
      views: viewsByDate.get(date) ?? 0,
      clicks: clicksByDate.get(date) ?? 0,
    })),
    devices: ["mobile", "desktop", "tablet"].map((device) => ({
      device,
      count: Number(deviceRows.find((row) => row.device_type === device)?.count ?? 0),
    })),
    referrers: referrerRows.map((row) => ({ referrer: row.referrer, count: Number(row.count) })),
  };
}

const vapidSettingKey = "vapid_keys";

export async function getVapidKeys() {
  const rows = await mysqlQuery<{ setting_value: unknown }[]>(
    "SELECT setting_value FROM settings WHERE setting_key = ?",
    [vapidSettingKey],
  );
  if (!rows.length) return null;
  return toJson<{ publicKey: string; privateKey: string } | null>(rows[0].setting_value, null);
}

export async function setVapidKeys(keys: { publicKey: string; privateKey: string }) {
  await mysqlQuery(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [vapidSettingKey, JSON.stringify(keys)],
  );
}

export async function addPushSubscription(
  pageId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
) {
  await mysqlQuery(
    `INSERT INTO push_subscriptions (page_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [pageId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent],
  );
}

export async function removePushSubscriptionByEndpoint(endpoint: string) {
  await mysqlQuery("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export async function listPushSubscriptions(pageId: number) {
  const rows = await mysqlQuery<PushSubscriptionRow[]>(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE page_id = ?",
    [pageId],
  );
  return rows;
}

export async function countPushSubscriptions(pageId: number) {
  const rows = await mysqlQuery<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM push_subscriptions WHERE page_id = ?",
    [pageId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function recordCampaign(
  pageId: number,
  input: { title: string; body: string; url: string; sentCount: number; failedCount: number },
): Promise<PushCampaign> {
  const result = await mysqlQuery<{ insertId: number }>(
    "INSERT INTO push_campaigns (page_id, title, body, url, sent_count, failed_count) VALUES (?, ?, ?, ?, ?, ?)",
    [pageId, input.title, input.body, input.url, input.sentCount, input.failedCount],
  );
  const rows = await mysqlQuery<{ created_at: string | Date }[]>(
    "SELECT created_at FROM push_campaigns WHERE id = ?",
    [result.insertId],
  );
  return {
    id: result.insertId,
    pageId,
    title: input.title,
    body: input.body,
    url: input.url,
    sentCount: input.sentCount,
    failedCount: input.failedCount,
    createdAt: toIso(rows[0].created_at),
  };
}

type PushCampaignRow = {
  id: number;
  page_id: number;
  title: string;
  body: string;
  url: string;
  sent_count: number;
  failed_count: number;
  created_at: string | Date;
};

export async function listCampaigns(pageId: number) {
  const rows = await mysqlQuery<PushCampaignRow[]>(
    "SELECT * FROM push_campaigns WHERE page_id = ? ORDER BY created_at DESC",
    [pageId],
  );
  return rows.map((row) => ({
    id: row.id,
    pageId: row.page_id,
    title: row.title,
    body: row.body,
    url: row.url,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    createdAt: toIso(row.created_at),
  }));
}
