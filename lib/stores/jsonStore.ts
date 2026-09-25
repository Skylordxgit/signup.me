import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  AnalyticsReport,
  AudienceFilters,
  BlockType,
  CampaignStatus,
  CityDetailMetric,
  CountryDetailMetric,
  CustomHtmlLinkMetric,
  CustomHtmlSettings,
  LocationMetric,
  NotificationCampaign,
  NotificationDeliveryLog,
  NotificationSendInput,
  NotificationSendResult,
  NotificationSubscriber,
  NotificationSubscriberSummary,
  NotificationTemplate,
  PageBlock,
  PageStatus,
  PushRecipient,
  PushSubscriptionRecord,
  RecentActivityItem,
  RegionDetailMetric,
  SmartPage,
  SubscriberSegment,
  SystemPushConfig,
  SystemPushAuditLog,
  SystemPushTestDevice,
  SystemPushConfigSource,
} from "../types";
import type { SubscriberDetails } from '../types';
import { subscriberListItem, mergeSubscriberDetails } from '../subscriberDetails';
import { defaultTheme, seedPages, seedTemplates } from "../defaults";
import { detectDevice, emptyBlock, isValidSlug, isValidImageUrl, isValidUrl, nowIso, safeReferrer, slugify, summarizePage } from "../utils";
import { configureWebPush, isPushSubscription, notificationPayload, sendPushBatch, sendPushBatchDetailed } from "../push";
import { DEFAULT_WORKSPACE_ID } from "../workspaces";
import { matchSubscriber, summarizeAudience } from "../audienceTargeting";
import { emptyCustomHtml } from "../customHtml";
import { invalidatePublishedPageCache, warmPublishedPageCache } from "../pageSnapshot";
import { duplicateCustomHtmlAssetOwnership, removeCustomHtmlAssetOwnership } from "../uploads";

type DatabaseShape = {
  pages: SmartPage[];
  pageViews: {
    id: number;
    workspaceId: string;
    pageId: number;
    date: string;
    device: string;
    referrer: string;
    visitorKey: string;
    country?: string;
    city?: string;
    location?: string;
    countryCode?: string;
    region?: string;
    regionCode?: string;
    geoSource?: string;
    ipHash?: string;
  }[];
  linkClicks: {
    id: number;
    workspaceId: string;
    pageId: number;
    blockId: number;
    date: string;
    device: string;
    referrer: string;
    country?: string;
    city?: string;
    location?: string;
    countryCode?: string;
    region?: string;
    regionCode?: string;
    geoSource?: string;
    ipHash?: string;
  }[];
  customHtmlLinkClicks: {
    id: number;
    workspaceId: string;
    pageId: number;
    href: string;
    date: string;
    device: string;
    referrer: string;
    country?: string;
    city?: string;
    location?: string;
    countryCode?: string;
    region?: string;
    regionCode?: string;
    geoSource?: string;
    ipHash?: string;
  }[];
  pushSubscriptions: (NotificationSubscriber & {
    subscription: PushSubscriptionRecord;
    vapidConfigVersion?: number;
    vapidKeyFingerprint?: string;
  })[];
  notificationCampaigns: NotificationCampaign[];
  notificationDeliveryLogs?: NotificationDeliveryLog[];
  subscriberSegments?: SubscriberSegment[];
  notificationTemplates?: NotificationTemplate[];
  systemPushConfig?: SystemPushConfig | null;
  systemPushAuditLogs?: SystemPushAuditLog[];
  systemPushTestDevices?: SystemPushTestDevice[];
};

/* Resolved per call rather than at import, so the working directory in effect
   when the store is used decides the file. */
// ponytail: one process-wide JSON writer; use MySQL for multiple server processes.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> => {
    const operation = writeQueue.catch(() => {}).then(() => run(...args));
    writeQueue = operation;
    return operation;
  };
}

export const createPage = serialized(createPageUnlocked);
export const updatePage = serialized(updatePageUnlocked);
export const deletePage = serialized(deletePageUnlocked);
export const duplicatePage = serialized(duplicatePageUnlocked);
export const createBlock = serialized(createBlockUnlocked);
export const updateBlock = serialized(updateBlockUnlocked);
export const deleteBlock = serialized(deleteBlockUnlocked);
export const duplicateBlock = serialized(duplicateBlockUnlocked);
export const reorderBlocks = serialized(reorderBlocksUnlocked);
export const trackView = serialized(trackViewUnlocked);
export const trackClick = serialized(trackClickUnlocked);
export const trackCustomHtmlLinkClick = serialized(trackCustomHtmlLinkClickUnlocked);
export const savePushSubscription = serialized(savePushSubscriptionUnlocked);
export const sendPushNotification = serialized(sendPushNotificationUnlocked);
export const createNotificationCampaign = serialized(createNotificationCampaignUnlocked);
export const updateNotificationCampaign = serialized(updateNotificationCampaignUnlocked);
export const deleteNotificationCampaign = serialized(deleteNotificationCampaignUnlocked);
export const recordNotificationCampaignEvent = serialized(recordNotificationCampaignEventUnlocked);
export const saveSubscriberSegment = serialized(saveSubscriberSegmentUnlocked);
export const deleteSubscriberSegment = serialized(deleteSubscriberSegmentUnlocked);
export const saveNotificationTemplate = serialized(saveNotificationTemplateUnlocked);
export const deleteNotificationTemplate = serialized(deleteNotificationTemplateUnlocked);
export const deactivatePushSubscription = serialized(deactivatePushSubscriptionUnlocked);
export const getSystemPushConfig = getSystemPushConfigUnlocked;
export const saveSystemPushConfig = serialized(saveSystemPushConfigUnlocked);
export const updateSystemPushConfigTestStatus = serialized(updateSystemPushConfigTestStatusUnlocked);
export const getSystemPushAuditLogs = getSystemPushAuditLogsUnlocked;
export const addSystemPushAuditLog = serialized(addSystemPushAuditLogUnlocked);
export const saveSystemTestDevice = serialized(saveSystemTestDeviceUnlocked);
export const getSystemTestDevice = getSystemTestDeviceUnlocked;

function dataFile() {
  return path.join(process.cwd(), "data", "db.json");
}

async function readJsonDb(): Promise<DatabaseShape> {
  try {
    const file = await fs.readFile(dataFile(), "utf8");
    const db = JSON.parse(file) as Partial<DatabaseShape>;
    const pages = (db.pages ?? []).map(sortBlocks);
    const scope = <T extends { pageId: number }>(record: T) => ({ ...record, workspaceId: pages.find(page => page.id === record.pageId)?.workspaceId || DEFAULT_WORKSPACE_ID });
    return {
      pages,
      pageViews: (db.pageViews ?? []).map(scope),
      linkClicks: (db.linkClicks ?? []).map(scope),
      customHtmlLinkClicks: (db.customHtmlLinkClicks ?? []).map(scope),
      pushSubscriptions: (db.pushSubscriptions ?? []).map(scope),
      notificationCampaigns: db.notificationCampaigns ?? [],
      notificationDeliveryLogs: db.notificationDeliveryLogs ?? [],
      subscriberSegments: db.subscriberSegments ?? [],
      systemPushConfig: db.systemPushConfig ?? null,
      systemPushAuditLogs: db.systemPushAuditLogs ?? [],
      systemPushTestDevices: db.systemPushTestDevices ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initial: DatabaseShape = {
      pages: seedPages(),
      pageViews: [],
      linkClicks: [],
      customHtmlLinkClicks: [],
      pushSubscriptions: [],
      notificationCampaigns: [],
      notificationDeliveryLogs: [],
      subscriberSegments: [],
      systemPushConfig: null,
      systemPushAuditLogs: [],
      systemPushTestDevices: [],
    };
    return initial;
  }
}

async function writeJsonDb(db: DatabaseShape) {
  const target = dataFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
  await fs.rename(temporary, target);
}

function nextId(items: { id: number }[]) {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

function nextBlockId(pages: SmartPage[]) {
  return nextId(pages.flatMap((page) => page.blocks));
}

function sortBlocks(page: SmartPage): SmartPage {
  // Pages stored before workspaces existed belong to the default workspace.
  const workspaceId = page.workspaceId || DEFAULT_WORKSPACE_ID;
  return { ...page, pageType: page.pageType || "standard", workspaceId, blocks: page.blocks.map(block => ({ ...block, workspaceId })).sort((a, b) => a.sortOrder - b.sortOrder) };
}

function inWorkspace(page: SmartPage, workspaceId?: string) {
  return !workspaceId || (page.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId;
}

export async function listPages(workspaceId?: string) {
  const db = await readJsonDb();
  return db.pages.filter((page) => inWorkspace(page, workspaceId)).map((page) => summarizePage(page));
}

/** Page totals per workspace, for the master admin overview. */
export async function pagesByWorkspace() {
  const db = await readJsonDb();
  return db.pages.map((page) => ({ id: page.id, workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID }));
}

export async function getPageById(id: number, workspaceId?: string) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === id && (workspaceId === undefined || item.workspaceId === workspaceId || !item.workspaceId && workspaceId === DEFAULT_WORKSPACE_ID));
  return page ? sortBlocks(page) : null;
}

export async function getPublicPageBySlug(slug: string, workspaceId?: string) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published" && inWorkspace(item, workspaceId));
  return page ? sortBlocks(page) : null;
}

export async function getPrimaryPublicPage(workspaceId: string) {
  const db = await readJsonDb();
  const page = db.pages
    .filter(item => item.status === 'published' && inWorkspace(item, workspaceId))
    .sort((a, b) => a.id - b.id)[0];
  return page ? sortBlocks(page) : null;
}

async function createPageUnlocked(input: {
  name: string;
  slug: string;
  title: string;
  bio: string;
  profileImage: string;
  workspaceId?: string;
}) {
  const db = await readJsonDb();
  const slug = slugify(input.slug || input.name);

  if (!isValidSlug(slug)) throw new Error("Invalid slug");
  if (db.pages.some((page) => page.slug === slug)) throw new Error("Slug already exists");
  if (input.profileImage && !isValidImageUrl(input.profileImage)) throw new Error("Invalid profile image URL");

  const timestamp = nowIso();
  const id = nextId(db.pages);
  const page: SmartPage = {
    id,
    workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
    name: input.name.trim(),
    slug,
    title: input.title.trim() || input.name.trim(),
    bio: input.bio.trim(),
    profileImage: input.profileImage.trim(),
    logoImage: "",
    status: "published",
    theme: defaultTheme,
    seo: {
      seoTitle: `${input.title || input.name} - Official Links`,
      metaDescription: input.bio.trim(),
      socialTitle: input.title || input.name,
      socialDescription: input.bio.trim(),
      ogImage: "",
      favicon: "",
    },
    integrations: { metaPixelId: "", gtmId: "" },
    views: 0,
    uniqueVisitors: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    blocks: [],
    pageType: "standard",
  };

  db.pages.push(page);
  await writeJsonDb(db);
  void invalidatePublishedPageCache(page.slug, page.workspaceId);
  return sortBlocks(page);
}

export const createCustomHtmlPage = serialized(async (input: { name: string; slug: string; title?: string; workspaceId?: string }) => {
  const page = await createPageUnlocked({ name: input.name, slug: input.slug, title: input.title || input.name, bio: "", profileImage: "", workspaceId: input.workspaceId });
  const db = await readJsonDb();
  const index = db.pages.findIndex(item => item.id === page.id);
  db.pages[index] = { ...db.pages[index], pageType: "custom_html", status: "draft", customHtml: emptyCustomHtml() };
  await writeJsonDb(db);
  void invalidatePublishedPageCache(page.slug, page.workspaceId);
  return sortBlocks(db.pages[index]);
});

export const saveCustomHtmlDraft = serialized(async (id: number, customHtml: CustomHtmlSettings) => {
  const db = await readJsonDb();
  const index = db.pages.findIndex(page => page.id === id && page.pageType === "custom_html");
  if (index < 0) return null;
  db.pages[index] = { ...db.pages[index], customHtml, updatedAt: nowIso() };
  await writeJsonDb(db);
  const updated = db.pages[index];
  void invalidatePublishedPageCache(updated.slug, updated.workspaceId);
  if (customHtml.publishedHtml) {
    void warmPublishedPageCache(updated.slug, updated.workspaceId);
  }
  return sortBlocks(updated);
});

async function updatePageUnlocked(id: number, patch: Partial<SmartPage>) {
  const db = await readJsonDb();
  const index = db.pages.findIndex((page) => page.id === id);
  if (index === -1) return null;

  const current = db.pages[index];
  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  if (!isValidSlug(nextSlug)) throw new Error("Invalid slug");
  if (db.pages.some((page) => page.id !== id && page.slug === nextSlug)) throw new Error("Slug already exists");

  const status = patch.status as PageStatus | undefined;
  if (status && !["published", "draft", "disabled"].includes(status)) throw new Error("Invalid status");
  if (patch.profileImage && !isValidImageUrl(patch.profileImage)) throw new Error("Invalid profile image URL");
  if (patch.logoImage && !isValidImageUrl(patch.logoImage)) throw new Error("Invalid logo image URL");
  if (patch.theme?.backgroundImage && !isValidImageUrl(patch.theme.backgroundImage)) throw new Error("Invalid cover image URL");
  if (patch.seo?.ogImage && !isValidImageUrl(patch.seo.ogImage)) throw new Error("Invalid social image URL");
  if (patch.seo?.favicon && !isValidImageUrl(patch.seo.favicon)) throw new Error("Invalid favicon URL");

  const nextStatus = status ?? current.status;
  db.pages[index] = {
    ...current,
    ...patch,
    id: current.id,
    // The owning workspace is not editable through the page API.
    workspaceId: current.workspaceId || DEFAULT_WORKSPACE_ID,
    slug: nextSlug,
    status: nextStatus,
    updatedAt: nowIso(),
    blocks: db.pages[index].blocks,
  };

  await writeJsonDb(db);
  const updated = db.pages[index];
  void invalidatePublishedPageCache(current.slug, current.workspaceId);
  if (nextSlug !== current.slug) {
    void invalidatePublishedPageCache(nextSlug, current.workspaceId);
  }
  if (nextStatus === "published") {
    void warmPublishedPageCache(nextSlug, current.workspaceId);
  }
  return sortBlocks(updated);
}

async function deletePageUnlocked(id: number) {
  const db = await readJsonDb();
  const pageToDelete = db.pages.find((page) => page.id === id);
  if (pageToDelete) {
    void invalidatePublishedPageCache(pageToDelete.slug, pageToDelete.workspaceId);
    if (pageToDelete.pageType === "custom_html") {
      await removeCustomHtmlAssetOwnership(id, pageToDelete.workspaceId || DEFAULT_WORKSPACE_ID);
    }
  }
  const before = db.pages.length;
  db.pages = db.pages.filter((page) => page.id !== id);
  db.pageViews = db.pageViews.filter(row => row.pageId !== id);
  db.linkClicks = db.linkClicks.filter(row => row.pageId !== id);
  db.pushSubscriptions = db.pushSubscriptions.filter(row => row.pageId !== id);
  if (db.customHtmlLinkClicks) {
    db.customHtmlLinkClicks = db.customHtmlLinkClicks.filter(row => row.pageId !== id);
  }
  await writeJsonDb(db);
  return db.pages.length !== before;
}

async function duplicatePageUnlocked(id: number) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === id);
  if (!page) return null;

  const timestamp = nowIso();
  const newId = nextId(db.pages);
  const firstBlockId = nextBlockId(db.pages);
  const duplicateSlugBase = `${page.slug}-copy`;
  let duplicateSlug = duplicateSlugBase;
  let suffix = 2;
  while (db.pages.some((item) => item.slug === duplicateSlug)) {
    duplicateSlug = `${duplicateSlugBase}-${suffix}`;
    suffix += 1;
  }

  const duplicate: SmartPage = {
    ...page,
    id: newId,
    name: `${page.name} Copy`,
    slug: duplicateSlug,
    status: "draft",
    views: 0,
    uniqueVisitors: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    blocks: page.blocks.map((block, index) => ({
      ...block,
      id: firstBlockId + index,
      pageId: newId,
      clicks: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    customHtml: page.customHtml ? { ...page.customHtml, publishedHtml: "", publishedVersion: 0 } : undefined,
  };

  db.pages.push(duplicate);
  await writeJsonDb(db);
  if (page.pageType === "custom_html") {
    await duplicateCustomHtmlAssetOwnership(page.id, newId, page.workspaceId || DEFAULT_WORKSPACE_ID);
  }
  return sortBlocks(duplicate);
}

async function createBlockUnlocked(pageId: number, type: BlockType) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
  if (!page) return null;

  const block = { ...emptyBlock(pageId, type, page.blocks.length + 1), workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID, id: nextBlockId(db.pages) };
  page.blocks.push(block);
  page.updatedAt = nowIso();
  await writeJsonDb(db);
  void invalidatePublishedPageCache(page.slug, page.workspaceId);
  return block;
}

/** The page a block belongs to, so routes can check the workspace before
 *  touching it. Returns null when the block does not exist. */
export async function blockPageId(id: number) {
  const db = await readJsonDb();
  return db.pages.find((page) => page.blocks.some((block) => block.id === id))?.id ?? null;
}

async function updateBlockUnlocked(id: number, patch: Partial<PageBlock>) {
  const db = await readJsonDb();
  for (const page of db.pages) {
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index === -1) continue;

    if (patch.url && !isValidUrl(patch.url) && !patch.url.includes("@") && !patch.url.startsWith("@")) {
      throw new Error("Invalid URL");
    }

    page.blocks[index] = { ...page.blocks[index], ...patch, id: page.blocks[index].id, pageId: page.id, workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID, updatedAt: nowIso() };
    page.updatedAt = nowIso();
    await writeJsonDb(db);
    void invalidatePublishedPageCache(page.slug, page.workspaceId);
    return page.blocks[index];
  }
  return null;
}

async function deleteBlockUnlocked(id: number) {
  const db = await readJsonDb();
  for (const page of db.pages) {
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index !== -1) {
      page.blocks.splice(index, 1);
      page.blocks = page.blocks.map((block, blockIndex) => ({ ...block, sortOrder: blockIndex + 1 }));
      page.updatedAt = nowIso();
      await writeJsonDb(db);
      void invalidatePublishedPageCache(page.slug, page.workspaceId);
      return true;
    }
  }
  return false;
}

async function duplicateBlockUnlocked(id: number) {
  const db = await readJsonDb();
  for (const page of db.pages) {
    const block = page.blocks.find((item) => item.id === id);
    if (!block) continue;

    const duplicate: PageBlock = {
      ...block,
      id: nextBlockId(db.pages),
      title: `${block.title} Copy`,
      sortOrder: block.sortOrder + 1,
      clicks: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    page.blocks.splice(block.sortOrder, 0, duplicate);
    page.blocks = page.blocks.map((item, index) => ({ ...item, sortOrder: index + 1 }));
    page.updatedAt = nowIso();
    await writeJsonDb(db);
    void invalidatePublishedPageCache(page.slug, page.workspaceId);
    return duplicate;
  }
  return null;
}

async function reorderBlocksUnlocked(pageId: number, blockIds: number[]) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
  if (!page) return null;
  if (blockIds.length !== page.blocks.length) throw new Error("Invalid block order");

  page.blocks = blockIds.map((blockId, index) => {
    const block = page.blocks.find((item) => item.id === blockId);
    if (!block) throw new Error("Invalid block order");
    return { ...block, sortOrder: index + 1 };
  });
  page.updatedAt = nowIso();
  await writeJsonDb(db);
  void invalidatePublishedPageCache(page.slug, page.workspaceId);
  return sortBlocks(page);
}

async function trackViewUnlocked(
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
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published" && inWorkspace(item, workspaceId));
  if (!page) return null;

  page.views += 1;
  if (!db.pageViews.some((view) => view.pageId === page.id && view.visitorKey === visitorKey)) {
    page.uniqueVisitors += 1;
  }
  db.pageViews.push({
    workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID,
    id: nextId(db.pageViews),
    pageId: page.id,
    date: nowIso(),
    device: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    visitorKey,
    country,
    city,
    location,
    countryCode,
    region,
    regionCode,
    geoSource,
    ipHash,
  });
  await writeJsonDb(db);
  return { ok: true };
}

async function trackClickUnlocked(
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
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId && item.status === 'published' && inWorkspace(item, workspaceId));
  const block = page?.blocks.find((item) => item.id === blockId);
  if (!page || !block) return null;

  block.clicks += 1;
  db.linkClicks.push({
    workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID,
    id: nextId(db.linkClicks),
    pageId,
    blockId,
    date: nowIso(),
    device: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    country,
    city,
    location,
    countryCode,
    region,
    regionCode,
    geoSource,
    ipHash,
  });
  await writeJsonDb(db);
  return { ok: true };
}

async function trackCustomHtmlLinkClickUnlocked(
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
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId && item.pageType === 'custom_html' && item.status === 'published' && inWorkspace(item, workspaceId));
  if (!page) return null;

  db.customHtmlLinkClicks.push({
    workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID,
    id: nextId(db.customHtmlLinkClicks),
    pageId,
    href,
    date: nowIso(),
    device: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    country,
    city,
    location,
    countryCode,
    region,
    regionCode,
    geoSource,
    ipHash,
  });
  await writeJsonDb(db);
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

  // Strip invalid legacy locations
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

  // Parse location string if available and fields are Unknown
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
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
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

  const viewsInRange = db.pageViews.filter(v => v.pageId === pageId && v.date.slice(0, 10) >= startDate && v.date.slice(0, 10) <= endDate);
  const clicksInRange = db.linkClicks.filter(c => c.pageId === pageId && c.date.slice(0, 10) >= startDate && c.date.slice(0, 10) <= endDate);
  const customHtmlClicksInRange = db.customHtmlLinkClicks.filter(c => c.pageId === pageId && c.date.slice(0, 10) >= startDate && c.date.slice(0, 10) <= endDate);

  const totalViews = daysInput === 'all' && !fromDate ? page.views : viewsInRange.length;
  const totalClicks = daysInput === 'all' && !fromDate ? page.blocks.reduce((sum, block) => sum + block.clicks, 0) + db.customHtmlLinkClicks.filter(c => c.pageId === pageId).length : clicksInRange.length + customHtmlClicksInRange.length;

  const uniqueVisitorsSet = new Set(viewsInRange.map(v => v.visitorKey || v.ipHash || String(v.id)));
  const uniqueVisitors = daysInput === 'all' && !fromDate ? page.uniqueVisitors : uniqueVisitorsSet.size;
  const returningVisitors = Math.max(0, totalViews - uniqueVisitors);

  const blockClicksMap = new Map<number, number>();
  for (const click of clicksInRange) {
    blockClicksMap.set(click.blockId, (blockClicksMap.get(click.blockId) || 0) + 1);
  }
  const customHtmlLinks = [...customHtmlClicksInRange.reduce<Map<string, number>>((links, click) => links.set(click.href, (links.get(click.href) || 0) + 1), new Map())]
    .map(([href, clicks]): CustomHtmlLinkMetric => ({ href, clicks }))
    .sort((a, b) => b.clicks - a.clicks);

  // Notification subscribers for this page
  const pageSubscribers = db.pushSubscriptions.filter(s => s.pageId === pageId && s.isActive !== false);
  const totalSubscribers = pageSubscribers.length;
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
    visitorsSet: Set<string>;
    links: Map<number, { blockId: number; blockTitle: string; clicks: number }>;
    geoSources: Set<string>;
  };

  type RegionAcc = {
    regionCode: string;
    regionName: string;
    countryName: string;
    views: number;
    clicks: number;
    subscribers: number;
    visitorsSet: Set<string>;
    cities: Map<string, CityAcc>;
    geoSources: Set<string>;
  };

  type CountryAcc = {
    countryCode: string;
    countryName: string;
    views: number;
    clicks: number;
    subscribers: number;
    visitorsSet: Set<string>;
    regions: Map<string, RegionAcc>;
    cities: Map<string, CityAcc>;
    geoSources: Set<string>;
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
        visitorsSet: new Set(),
        regions: new Map(),
        cities: new Map(),
        geoSources: new Set(),
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
        visitorsSet: new Set(),
        cities: new Map(),
        geoSources: new Set(),
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
        visitorsSet: new Set(),
        links: new Map(),
        geoSources: new Set(),
      };
      cItem.cities.set(geo.city, ctItem);
      rItem.cities.set(geo.city, ctItem);
      flatCitiesAcc.set(cityKey, ctItem);
    }
    return ctItem;
  }

  function deriveGeoSource(sources: Set<string>): string {
    if (sources.has('ip_geo')) return 'ip_geo';
    if (sources.has('http_api')) return 'http_api';
    if (sources.has('cdn_header')) return 'cdn_header';
    if (sources.has('legacy_timezone')) return 'legacy_timezone';
    return sources.values().next().value || 'unknown';
  }

  for (const view of viewsInRange) {
    const geo = normalizeGeoRecord(view);
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);
    const vKey = view.visitorKey || view.ipHash || String(view.id);

    cItem.views += 1;
    cItem.visitorsSet.add(vKey);
    cItem.geoSources.add(geo.geoSource);

    rItem.views += 1;
    rItem.visitorsSet.add(vKey);
    rItem.geoSources.add(geo.geoSource);

    ctItem.views += 1;
    ctItem.visitorsSet.add(vKey);
    ctItem.geoSources.add(geo.geoSource);
  }

  for (const click of clicksInRange) {
    const geo = normalizeGeoRecord(click);
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);

    cItem.clicks += 1;
    rItem.clicks += 1;
    ctItem.clicks += 1;
    cItem.geoSources.add(geo.geoSource);
    rItem.geoSources.add(geo.geoSource);
    ctItem.geoSources.add(geo.geoSource);

    const block = page.blocks.find(b => b.id === click.blockId);
    const blockTitle = block?.title || `Block #${click.blockId}`;
    const linkItem = ctItem.links.get(click.blockId) || { blockId: click.blockId, blockTitle, clicks: 0 };
    linkItem.clicks += 1;
    ctItem.links.set(click.blockId, linkItem);
  }

  for (const sub of pageSubscribers) {
    const details = sub.details || ({} as Partial<SubscriberDetails>);
    const geo = normalizeGeoRecord({
      country: details.countryName || details.country,
      countryCode: details.countryCode,
      region: details.regionName || details.region,
      regionCode: details.regionCode,
      city: details.city,
      geoSource: details.geoSource,
    });
    const cItem = getOrInitCountry(geo);
    const rItem = getOrInitRegion(cItem, geo);
    const ctItem = getOrInitCity(cItem, rItem, geo);

    cItem.subscribers += 1;
    rItem.subscribers += 1;
    ctItem.subscribers += 1;
    cItem.geoSources.add(geo.geoSource);
    rItem.geoSources.add(geo.geoSource);
    ctItem.geoSources.add(geo.geoSource);
  }

  const countriesResult: CountryDetailMetric[] = [...countriesAcc.values()].map(c => {
    const cVisitors = c.visitorsSet.size;
    const regionsList: RegionDetailMetric[] = [...c.regions.values()].map(r => {
      const rVisitors = r.visitorsSet.size;
      const citiesList: CityDetailMetric[] = [...r.cities.values()].map(ct => {
        const ctVisitors = ct.visitorsSet.size;
        return {
          city: ct.city,
          region: ct.region,
          country: ct.country,
          location: ct.location,
          views: ct.views,
          visitors: ctVisitors,
          clicks: ct.clicks,
          subscribers: ct.subscribers,
          ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
          viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
          visitorShare: uniqueVisitors > 0 ? Number(((ctVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
          topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
          geoSource: deriveGeoSource(ct.geoSources),
        };
      }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

      return {
        regionCode: r.regionCode,
        regionName: r.regionName,
        countryName: r.countryName,
        views: r.views,
        visitors: rVisitors,
        clicks: r.clicks,
        subscribers: r.subscribers,
        ctr: r.views > 0 ? Number(((r.clicks / r.views) * 100).toFixed(1)) : (r.clicks > 0 ? 100 : 0),
        viewShare: totalViews > 0 ? Number(((r.views / totalViews) * 100).toFixed(1)) : 0,
        visitorShare: uniqueVisitors > 0 ? Number(((rVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
        cities: citiesList,
        geoSource: deriveGeoSource(r.geoSources),
      };
    }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    const allCitiesInCountry: CityDetailMetric[] = [...c.cities.values()].map(ct => {
      const ctVisitors = ct.visitorsSet.size;
      return {
        city: ct.city,
        region: ct.region,
        country: ct.country,
        location: ct.location,
        views: ct.views,
        visitors: ctVisitors,
        clicks: ct.clicks,
        subscribers: ct.subscribers,
        ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
        viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
        visitorShare: uniqueVisitors > 0 ? Number(((ctVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
        topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
        geoSource: deriveGeoSource(ct.geoSources),
      };
    }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    return {
      countryCode: c.countryCode,
      countryName: c.countryName,
      views: c.views,
      visitors: cVisitors,
      clicks: c.clicks,
      subscribers: c.subscribers,
      ctr: c.views > 0 ? Number(((c.clicks / c.views) * 100).toFixed(1)) : (c.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((c.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((cVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      regions: regionsList,
      cities: allCitiesInCountry,
      geoSource: deriveGeoSource(c.geoSources),
    };
  }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  const regionsResult: RegionDetailMetric[] = [...regionsAcc.values()].map(r => {
    const rVisitors = r.visitorsSet.size;
    const citiesList: CityDetailMetric[] = [...r.cities.values()].map(ct => {
      const ctVisitors = ct.visitorsSet.size;
      return {
        city: ct.city,
        region: ct.region,
        country: ct.country,
        location: ct.location,
        views: ct.views,
        visitors: ctVisitors,
        clicks: ct.clicks,
        subscribers: ct.subscribers,
        ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
        viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
        visitorShare: uniqueVisitors > 0 ? Number(((ctVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
        topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
        geoSource: deriveGeoSource(ct.geoSources),
      };
    }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

    return {
      regionCode: r.regionCode,
      regionName: r.regionName,
      countryName: r.countryName,
      views: r.views,
      visitors: rVisitors,
      clicks: r.clicks,
      subscribers: r.subscribers,
      ctr: r.views > 0 ? Number(((r.clicks / r.views) * 100).toFixed(1)) : (r.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((r.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((rVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      cities: citiesList,
      geoSource: deriveGeoSource(r.geoSources),
    };
  }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  const flatLocationsResult: LocationMetric[] = [...flatCitiesAcc.values()].map(ct => {
    const ctVisitors = ct.visitorsSet.size;
    return {
      location: ct.location,
      country: ct.country,
      region: ct.region,
      city: ct.city,
      views: ct.views,
      visitors: ctVisitors,
      clicks: ct.clicks,
      subscribers: ct.subscribers,
      ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
      viewShare: totalViews > 0 ? Number(((ct.views / totalViews) * 100).toFixed(1)) : 0,
      visitorShare: uniqueVisitors > 0 ? Number(((ctVisitors / uniqueVisitors) * 100).toFixed(1)) : 0,
      geoSource: deriveGeoSource(ct.geoSources),
    };
  }).sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));

  // Traffic sources from referrer (separated from geography!)
  const trafficSources = Object.entries(
    viewsInRange.reduce<Record<string, { views: number; clicks: number }>>((acc, view) => {
      const src = view.referrer || 'Direct';
      const curr = acc[src] || { views: 0, clicks: 0 };
      curr.views += 1;
      acc[src] = curr;
      return acc;
    }, {})
  ).map(([source, stats]) => ({
    source,
    views: stats.views,
    clicks: stats.clicks,
    ctr: stats.views > 0 ? Number(((stats.clicks / stats.views) * 100).toFixed(1)) : 0,
    percentage: totalViews > 0 ? Number(((stats.views / totalViews) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.views - a.views);

  // Link click details by block and location
  const linkLocationsMap = new Map<string, { blockId: number; blockTitle: string; location: string; country: string; region?: string; city: string; clicks: number }>();
  for (const click of clicksInRange) {
    const block = page.blocks.find(b => b.id === click.blockId);
    const blockTitle = block?.title || `Block #${click.blockId}`;
    const geo = normalizeGeoRecord(click);
    const key = `${click.blockId}:${geo.location}`;
    const current = linkLocationsMap.get(key) || {
      blockId: click.blockId,
      blockTitle,
      location: geo.location,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      clicks: 0,
    };
    current.clicks += 1;
    linkLocationsMap.set(key, current);
  }

  // Recent activity stream (top 30 newest events)
  const recentEvents: RecentActivityItem[] = [];
  for (const view of viewsInRange) {
    const geo = normalizeGeoRecord(view);
    recentEvents.push({
      id: `v-${view.id}`,
      type: 'view',
      pageId: view.pageId,
      pageName: page.name,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      location: geo.location,
      device: view.device || 'desktop',
      referrer: view.referrer || 'Direct',
      date: view.date,
    });
  }
  for (const click of clicksInRange) {
    const block = page.blocks.find(b => b.id === click.blockId);
    const geo = normalizeGeoRecord(click);
    recentEvents.push({
      id: `c-${click.id}`,
      type: 'click',
      pageId: click.pageId,
      pageName: page.name,
      blockId: click.blockId,
      blockTitle: block?.title || `Block #${click.blockId}`,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      location: geo.location,
      device: click.device || 'desktop',
      referrer: click.referrer || 'Direct',
      date: click.date,
    });
  }
  recentEvents.sort((a, b) => b.date.localeCompare(a.date));
  const recentActivity = recentEvents.slice(0, 30);

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
      views: viewsInRange.filter((view) => view.date.startsWith(date)).length,
      clicks: clicksInRange.filter((click) => click.date.startsWith(date)).length,
    })),
    devices: ["mobile", "desktop", "tablet"].map((device) => {
      const count = viewsInRange.filter((view) => view.device === device).length;
      return {
        device,
        count,
        percentage: totalViews > 0 ? Number(((count / totalViews) * 100).toFixed(1)) : 0,
      };
    }),
    referrers: Object.entries(
      viewsInRange.reduce<Record<string, number>>((acc, view) => {
        acc[view.referrer] = (acc[view.referrer] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([referrer, count]) => ({
      referrer,
      count,
      percentage: totalViews > 0 ? Number(((count / totalViews) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.count - a.count),
    trafficSources,
    locations: flatLocationsResult,
    regions: regionsResult,
    linkLocations: [...linkLocationsMap.values()].sort((a, b) => b.clicks - a.clicks),
    countries: countriesResult,
    customHtmlLinks,
    recentActivity,
    days: daysInput,
    startDate,
    endDate,
  };
}

function subscriptionHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

async function savePushSubscriptionUnlocked(
  slug: string,
  subscription: PushSubscriptionRecord,
  userAgent: string,
  details?: SubscriberDetails,
  workspaceId?: string,
  vapidMeta?: { configVersion?: number; fingerprint?: string }
) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published" && inWorkspace(item, workspaceId));
  if (!page) return null;

  const timestamp = nowIso();
  const endpointHash = subscriptionHash(subscription.endpoint);
  const ownerWorkspaceId = page.workspaceId || DEFAULT_WORKSPACE_ID;
  const existing = db.pushSubscriptions.find((item) => item.endpointHash === endpointHash && item.workspaceId === ownerWorkspaceId);
  if (existing) {
    existing.pageId = page.id;
    existing.slug = page.slug;
    existing.subscription = subscription;
    existing.userAgent = userAgent.slice(0, 500);
    if (details) existing.details = mergeSubscriberDetails(existing.details, details);
    existing.isActive = true;
    existing.lastFailedAt = null;
    if (vapidMeta?.configVersion) existing.vapidConfigVersion = vapidMeta.configVersion;
    if (vapidMeta?.fingerprint) existing.vapidKeyFingerprint = vapidMeta.fingerprint;
    existing.updatedAt = timestamp;
    await writeJsonDb(db);
    return existing;
  }

  const subscriber = {
    workspaceId: ownerWorkspaceId,
    id: nextId(db.pushSubscriptions),
    pageId: page.id,
    slug: page.slug,
    endpointHash,
    subscription,
    userAgent: userAgent.slice(0, 500),
    details,
    isActive: true,
    lastFailedAt: null,
    vapidConfigVersion: vapidMeta?.configVersion,
    vapidKeyFingerprint: vapidMeta?.fingerprint,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.pushSubscriptions.push(subscriber);
  await writeJsonDb(db);
  return subscriber;
}

export async function listPushSubscribers(workspaceId?: string, filters?: AudienceFilters): Promise<NotificationSubscriberSummary> {
  const db = await readJsonDb();
  // Subscribers stay scoped to their page, and so to that page's workspace.
  const owned = (pageId: number) => !workspaceId || inWorkspace(db.pages.find(page => page.id === pageId) ?? ({} as SmartPage), workspaceId);
  let subscriptions = db.pushSubscriptions.filter(item => owned(item.pageId));
  if (filters) {
    subscriptions = subscriptions.filter(item => matchSubscriber(item, filters));
  }
  const active = subscriptions.filter(item => item.isActive !== false);
  const byPage = active.reduce<Map<number, { pageId: number; slug: string; subscribers: number }>>((acc, item) => {
    const current = acc.get(item.pageId) ?? { pageId: item.pageId, slug: item.slug, subscribers: 0 };
    current.subscribers += 1;
    acc.set(item.pageId, current);
    return acc;
  }, new Map());
  const recent = [...subscriptions].sort((a, b) => b.id - a.id).slice(0, 100).map(item => subscriberListItem({ ...item, isActive: item.isActive !== false, slug: db.pages.find(page => page.id === item.pageId)?.slug || item.slug }));
  return { total: active.length, inactive: subscriptions.length - active.length, byPage: [...byPage.values()].sort((a, b) => b.subscribers - a.subscribers), recent };
}

export async function getPushSubscriberForTest(
  workspaceId: string,
  criteria?: { subscriberId?: number; endpointHash?: string }
): Promise<{ id: number; endpointHash: string; subscription: PushSubscriptionRecord; browser: string; device: string; location: string } | null> {
  const db = await readJsonDb();
  let matches = db.pushSubscriptions.filter(s => (!workspaceId || s.workspaceId === workspaceId) && s.isActive !== false);

  if (criteria?.subscriberId) {
    matches = matches.filter(s => s.id === criteria.subscriberId);
  }
  if (criteria?.endpointHash) {
    matches = matches.filter(s => s.endpointHash === criteria.endpointHash);
  }

  const found = matches.sort((a, b) => b.id - a.id)[0];
  if (!found || !isPushSubscription(found.subscription)) return null;

  const details = (found.details || {}) as Partial<SubscriberDetails>;
  const browser = details.browser || "Browser";
  const device = details.device || "Device";
  const location = details.city && details.city !== "Unknown" ? `${details.city}, ${details.country || ""}` : details.country || "Unknown Location";

  return {
    id: found.id,
    endpointHash: found.endpointHash,
    subscription: found.subscription,
    browser,
    device,
    location,
  };
}

async function deactivatePushSubscriptionUnlocked(workspaceId: string, endpointHash: string): Promise<void> {
  const db = await readJsonDb();
  let updated = false;
  const timestamp = new Date().toISOString();
  db.pushSubscriptions = db.pushSubscriptions.map((item) => {
    if ((!workspaceId || item.workspaceId === workspaceId) && item.endpointHash === endpointHash) {
      updated = true;
      return { ...item, isActive: false, lastFailedAt: timestamp, updatedAt: timestamp };
    }
    return item;
  });
  if (updated) {
    await writeJsonDb(db);
  }
}

function campaignAudience(input: NotificationSendInput, page?: SmartPage) {
  if (input.targetFilters) {
    return summarizeAudience(input.targetFilters, page?.slug);
  }
  return input.pageId && page ? `/${page.slug}` : 'All subscribers';
}

function normalizeCampaign(campaign: NotificationCampaign): NotificationCampaign {
  const clicked = Number(campaign.clicked ?? campaign.clicks ?? 0);
  return {
    ...campaign,
    name: campaign.name || campaign.title || `Campaign #${campaign.id}`,
    status: campaign.status || (campaign.sent > 0 || campaign.attempted > 0 ? 'completed' : 'draft'),
    pageSlug: campaign.pageSlug ?? null,
    image: campaign.image ?? null,
    icon: campaign.icon ?? null,
    badge: campaign.badge ?? null,
    ctaText: campaign.ctaText ?? null,
    scheduledAt: campaign.scheduledAt ?? null,
    priority: campaign.priority ?? 'normal',
    delivered: Number(campaign.delivered ?? 0),
    seen: Number(campaign.seen ?? 0),
    clicked,
    clicks: clicked,
  };
}

export async function listNotificationCampaigns(workspaceId?: string): Promise<NotificationCampaign[]> {
  const db = await readJsonDb();
  return db.notificationCampaigns
    .filter(campaign => !workspaceId || campaign.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(normalizeCampaign)
    .slice(0, 100);
}

export async function getNotificationCampaignById(id: number, workspaceId?: string): Promise<NotificationCampaign | null> {
  const db = await readJsonDb();
  const campaign = db.notificationCampaigns.find(c => c.id === id && (!workspaceId || c.workspaceId === workspaceId));
  return campaign ? normalizeCampaign(campaign) : null;
}

async function createNotificationCampaignUnlocked(input: NotificationSendInput): Promise<NotificationCampaign> {
  const db = await readJsonDb();
  const page = input.pageId ? db.pages.find(item => item.id === input.pageId) : undefined;
  const timestamp = nowIso();
  const campaign: NotificationCampaign = {
    id: nextId(db.notificationCampaigns),
    workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
    name: input.name?.trim() || input.title.trim(),
    pageId: input.pageId ?? null,
    pageSlug: page?.slug ?? null,
    title: input.title.trim(),
    body: input.body.trim(),
    image: input.image || null,
    icon: input.icon || null,
    badge: input.badge || null,
    ctaText: input.ctaText || null,
    url: input.url.trim() || '/',
    audience: campaignAudience(input, page),
    status: input.status || (input.scheduledAt ? 'scheduled' : 'draft'),
    scheduledAt: input.scheduledAt || null,
    timezone: input.timezone || '',
    priority: input.priority || 'normal',
    targetFilters: input.targetFilters || {},
    attempted: 0,
    sent: 0,
    delivered: 0,
    seen: 0,
    clicked: 0,
    clicks: 0,
    failed: 0,
    removed: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.notificationCampaigns.push(campaign);
  await writeJsonDb(db);
  return normalizeCampaign(campaign);
}

async function updateNotificationCampaignUnlocked(id: number, patch: Partial<NotificationCampaign>, workspaceId?: string): Promise<NotificationCampaign | null> {
  const db = await readJsonDb();
  const campaign = db.notificationCampaigns.find(c => c.id === id && (!workspaceId || c.workspaceId === workspaceId));
  if (!campaign) return null;
  Object.assign(campaign, patch, { updatedAt: nowIso() });
  await writeJsonDb(db);
  return normalizeCampaign(campaign);
}

async function deleteNotificationCampaignUnlocked(id: number, workspaceId?: string): Promise<boolean> {
  const db = await readJsonDb();
  const index = db.notificationCampaigns.findIndex(c => c.id === id && (!workspaceId || c.workspaceId === workspaceId));
  if (index === -1) return false;
  db.notificationCampaigns.splice(index, 1);
  if (db.notificationDeliveryLogs) {
    db.notificationDeliveryLogs = db.notificationDeliveryLogs.filter(log => log.campaignId !== id);
  }
  await writeJsonDb(db);
  return true;
}

export async function trackNotificationCampaignClick(campaignId: number, subscriberId?: number) {
  const db = await readJsonDb();
  const campaign = db.notificationCampaigns.find(item => item.id === campaignId);
  if (campaign) {
    Object.assign(campaign, normalizeCampaign(campaign));
    campaign.clicked += 1;
    campaign.clicks = campaign.clicked;
    campaign.updatedAt = nowIso();
    if (db.notificationDeliveryLogs && subscriberId) {
      const log = db.notificationDeliveryLogs.find(l => l.campaignId === campaignId && l.subscriberId === subscriberId);
      if (log) {
        log.status = 'clicked';
        log.clickedAt = nowIso();
      }
    }
    await writeJsonDb(db);
    return true;
  }
  return false;
}

async function sendPushNotificationUnlocked(input: NotificationSendInput): Promise<NotificationSendResult> {
  configureWebPush();
  const db = await readJsonDb();
  const page = input.pageId ? db.pages.find(item => item.id === input.pageId) : undefined;
  
  // Resolve target subscribers scoped to workspace and matching targetFilters
  const allSubscribers = db.pushSubscriptions.filter((item) =>
    item.isActive !== false
    && (!input.pageId || item.pageId === input.pageId)
    && (!input.workspaceId || inWorkspace(db.pages.find(p => p.id === item.pageId) ?? ({} as SmartPage), input.workspaceId))
  );
  const targetSubscribers = allSubscribers.filter((s) => matchSubscriber(s, input.targetFilters));

  const timestamp = nowIso();
  let campaign: NotificationCampaign;

  if (input.campaignId) {
    const existing = db.notificationCampaigns.find(c => c.id === input.campaignId);
    if (existing) {
      campaign = existing;
      campaign.status = 'sending';
      campaign.startedAt = timestamp;
      campaign.attempted = targetSubscribers.length;
      campaign.updatedAt = timestamp;
    } else {
      campaign = {
        id: input.campaignId,
        workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
        name: input.name?.trim() || input.title.trim(),
        pageId: input.pageId ?? null,
        pageSlug: page?.slug ?? null,
        title: input.title.trim(),
        body: input.body.trim(),
        image: input.image || null,
        icon: input.icon || null,
        badge: input.badge || null,
        ctaText: input.ctaText || null,
        url: input.url.trim() || '/',
        audience: campaignAudience(input, page),
        status: 'sending',
        targetFilters: input.targetFilters || {},
        attempted: targetSubscribers.length,
        sent: 0,
        delivered: 0,
        seen: 0,
        clicked: 0,
        clicks: 0,
        failed: 0,
        removed: 0,
        startedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.notificationCampaigns.push(campaign);
    }
  } else {
    campaign = {
      id: nextId(db.notificationCampaigns),
      workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
      name: input.name?.trim() || input.title.trim(),
      pageId: input.pageId ?? null,
      pageSlug: page?.slug ?? null,
      title: input.title.trim(),
      body: input.body.trim(),
      image: input.image || null,
      icon: input.icon || null,
      badge: input.badge || null,
      ctaText: input.ctaText || null,
      url: input.url.trim() || '/',
      audience: campaignAudience(input, page),
      status: 'sending',
      scheduledAt: input.scheduledAt || null,
      timezone: input.timezone || '',
      priority: input.priority || 'normal',
      targetFilters: input.targetFilters || {},
      attempted: targetSubscribers.length,
      sent: 0,
      delivered: 0,
      seen: 0,
      clicked: 0,
      clicks: 0,
      failed: 0,
      removed: 0,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db.notificationCampaigns.push(campaign);
  }
  await writeJsonDb(db);

  if (!db.notificationDeliveryLogs) db.notificationDeliveryLogs = [];

  const locationStats: Record<string, { sent: number; clicked: number; delivered: number }> = {};
  const deviceStats: Record<string, { sent: number; clicked: number; delivered: number }> = {};

  const recipients: PushRecipient[] = targetSubscribers.map((item) => ({
    id: item.id,
    endpointHash: item.endpointHash,
    subscription: item.subscription,
    pageSlug: item.slug,
    userAgent: item.userAgent,
    details: item.details,
  }));

  const { result, expired, authFailed, items } = await sendPushBatchDetailed(
    recipients,
    notificationPayload({ ...input, campaignId: campaign.id }),
    { concurrency: input.batchSize || 10, priority: input.priority }
  );

  for (const item of items) {
    const locKey = item.city && item.city !== "Unknown" ? `${item.city}, ${item.country}` : item.country || "Unknown Location";
    const devKey = item.device || "desktop";

    if (!locationStats[locKey]) locationStats[locKey] = { sent: 0, clicked: 0, delivered: 0 };
    if (!deviceStats[devKey]) deviceStats[devKey] = { sent: 0, clicked: 0, delivered: 0 };

    if (item.status === "sent") {
      locationStats[locKey].sent += 1;
      deviceStats[devKey].sent += 1;
    }

    db.notificationDeliveryLogs.push({
      id: randomUUID(),
      campaignId: campaign.id,
      campaignName: campaign.name || campaign.title,
      subscriberId: item.recipientId,
      endpointHash: item.endpointHash,
      pageSlug: item.pageSlug || "",
      country: item.country,
      region: item.region || "",
      city: item.city,
      device: item.device,
      browser: item.browser,
      status: item.status,
      statusCode: item.statusCode,
      errorReason: item.errorReason,
      sentAt: timestamp,
    });
  }

  // Keep delivery logs bounded
  if (db.notificationDeliveryLogs.length > 5000) {
    db.notificationDeliveryLogs = db.notificationDeliveryLogs.slice(-5000);
  }

  let finalStatus: CampaignStatus = "completed";
  if (result.attempted === 0) finalStatus = "completed";
  else if (result.sent === 0 && result.failed > 0) finalStatus = "failed";
  else if (result.sent > 0 && result.failed > 0) finalStatus = "completed_with_failures";
  else finalStatus = "completed";

  const latest = await readJsonDb();
  const stored = latest.notificationCampaigns.find((item) => item.id === campaign.id);
  if (stored) {
    stored.attempted = result.attempted;
    stored.sent = result.sent;
    stored.delivered = result.sent;
    stored.removed = result.removed;
    stored.failed = result.failed;
    stored.status = finalStatus;
    stored.completedAt = nowIso();
    stored.locationStats = locationStats;
    stored.deviceStats = deviceStats;
    stored.updatedAt = nowIso();
  }
  const deactivations = new Set([...expired, ...authFailed].map(subscriptionHash));
  if (deactivations.size) {
    latest.pushSubscriptions = latest.pushSubscriptions.map((item) =>
      item.workspaceId === campaign.workspaceId && deactivations.has(item.endpointHash)
        ? { ...item, isActive: false, lastFailedAt: timestamp, updatedAt: timestamp }
        : item
    );
  }
  await writeJsonDb(latest);

  return { ...result, campaignId: campaign.id, campaign: stored ? normalizeCampaign(stored) : normalizeCampaign(campaign) };
}

export async function listNotificationHistory(
  workspaceId?: string,
  filters?: { campaignId?: number; limit?: number; offset?: number; search?: string; country?: string; city?: string; device?: string; status?: string }
): Promise<{ items: NotificationDeliveryLog[]; total: number }> {
  const db = await readJsonDb();
  let logs = db.notificationDeliveryLogs ?? [];

  if (workspaceId) {
    const workspaceCampaignIds = new Set(db.notificationCampaigns.filter(c => c.workspaceId === workspaceId).map(c => c.id));
    logs = logs.filter(l => workspaceCampaignIds.has(l.campaignId));
  }

  if (filters?.campaignId) {
    logs = logs.filter(l => l.campaignId === filters.campaignId);
  }

  if (filters?.country) {
    logs = logs.filter(l => l.country.toLowerCase() === filters.country!.toLowerCase());
  }

  if (filters?.city) {
    logs = logs.filter(l => l.city.toLowerCase() === filters.city!.toLowerCase());
  }

  if (filters?.device) {
    logs = logs.filter(l => l.device.toLowerCase() === filters.device!.toLowerCase());
  }

  if (filters?.status) {
    logs = logs.filter(l => l.status === filters.status);
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    logs = logs.filter(l =>
      l.campaignName.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.country.toLowerCase().includes(q) ||
      (l.pageSlug && l.pageSlug.toLowerCase().includes(q))
    );
  }

  logs.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const total = logs.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 100;
  const items = logs.slice(offset, offset + limit);

  return { items, total };
}

export async function listSubscriberSegments(workspaceId: string): Promise<SubscriberSegment[]> {
  const db = await readJsonDb();
  const subscribers = db.pushSubscriptions.filter(s => inWorkspace(db.pages.find(p => p.id === s.pageId) ?? ({} as SmartPage), workspaceId));
  const segments = (db.subscriberSegments ?? []).filter(s => s.workspaceId === workspaceId);
  return segments.map(seg => ({
    ...seg,
    subscriberCount: subscribers.filter(s => matchSubscriber(s, seg.filters)).length,
  }));
}

async function saveSubscriberSegmentUnlocked(segment: Partial<SubscriberSegment> & { name: string; filters: AudienceFilters; workspaceId: string }): Promise<SubscriberSegment> {
  const db = await readJsonDb();
  if (!db.subscriberSegments) db.subscriberSegments = [];
  const timestamp = nowIso();
  const existing = segment.id ? db.subscriberSegments.find(s => s.id === segment.id && s.workspaceId === segment.workspaceId) : null;
  if (existing) {
    existing.name = segment.name.trim();
    if (segment.description !== undefined) existing.description = segment.description.trim();
    existing.filters = segment.filters;
    existing.updatedAt = timestamp;
    await writeJsonDb(db);
    return existing;
  }
  const created: SubscriberSegment = {
    id: segment.id || randomUUID(),
    workspaceId: segment.workspaceId,
    name: segment.name.trim(),
    description: segment.description?.trim() || '',
    filters: segment.filters,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.subscriberSegments.push(created);
  await writeJsonDb(db);
  return created;
}

async function deleteSubscriberSegmentUnlocked(id: string, workspaceId: string): Promise<boolean> {
  const db = await readJsonDb();
  if (!db.subscriberSegments) return false;
  const index = db.subscriberSegments.findIndex(s => s.id === id && s.workspaceId === workspaceId);
  if (index === -1) return false;
  db.subscriberSegments.splice(index, 1);
  await writeJsonDb(db);
  return true;
}

async function recordNotificationCampaignEventUnlocked(campaignId: number, event: 'delivered' | 'seen' | 'clicked') {
  if (!Number.isFinite(campaignId)) return null;
  const db = await readJsonDb();
  const campaign = db.notificationCampaigns.find(item => item.id === campaignId);
  if (!campaign) return null;
  Object.assign(campaign, normalizeCampaign(campaign));
  campaign[event] += 1;
  campaign.updatedAt = nowIso();
  await writeJsonDb(db);
  return campaign;
}

export async function listNotificationTemplates(workspaceId: string): Promise<NotificationTemplate[]> {
  const db = await readJsonDb();
  if (!db.notificationTemplates || db.notificationTemplates.length === 0) {
    db.notificationTemplates = seedTemplates(workspaceId);
    await writeJsonDb(db);
  }
  return db.notificationTemplates.filter(t => t.workspaceId === workspaceId);
}

async function saveNotificationTemplateUnlocked(template: Partial<NotificationTemplate> & { name: string; title: string; body: string; workspaceId: string }): Promise<NotificationTemplate> {
  const db = await readJsonDb();
  if (!db.notificationTemplates) db.notificationTemplates = [];
  const timestamp = nowIso();
  const existing = template.id ? db.notificationTemplates.find(t => t.id === template.id && t.workspaceId === template.workspaceId) : null;
  if (existing) {
    existing.name = template.name.trim();
    existing.title = template.title.trim();
    existing.body = template.body.trim();
    if (template.category !== undefined) existing.category = template.category;
    if (template.url !== undefined) existing.url = template.url;
    if (template.icon !== undefined) existing.icon = template.icon;
    if (template.image !== undefined) existing.image = template.image;
    if (template.badge !== undefined) existing.badge = template.badge;
    if (template.ctaText !== undefined) existing.ctaText = template.ctaText;
    existing.updatedAt = timestamp;
    await writeJsonDb(db);
    return existing;
  }
  const created: NotificationTemplate = {
    id: template.id || randomUUID(),
    workspaceId: template.workspaceId,
    name: template.name.trim(),
    category: template.category || 'custom',
    title: template.title.trim(),
    body: template.body.trim(),
    url: template.url || '/',
    icon: template.icon || null,
    image: template.image || null,
    badge: template.badge || null,
    ctaText: template.ctaText || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.notificationTemplates.push(created);
  await writeJsonDb(db);
  return created;
}

async function deleteNotificationTemplateUnlocked(id: string, workspaceId: string): Promise<boolean> {
  const db = await readJsonDb();
  if (!db.notificationTemplates) return false;
  const index = db.notificationTemplates.findIndex(t => t.id === id && t.workspaceId === workspaceId);
  if (index === -1) return false;
  db.notificationTemplates.splice(index, 1);
  await writeJsonDb(db);
  return true;
}

async function getSystemPushConfigUnlocked(): Promise<SystemPushConfig | null> {
  const db = await readJsonDb();
  if (!db.systemPushConfig) return null;
  return db.systemPushConfig;
}

async function saveSystemPushConfigUnlocked(
  config: Omit<SystemPushConfig, "id" | "createdAt" | "updatedAt">
): Promise<SystemPushConfig> {
  const db = await readJsonDb();
  const timestamp = new Date().toISOString();
  const newConfig: SystemPushConfig = {
    ...config,
    id: db.systemPushConfig ? db.systemPushConfig.id + 1 : 1,
    createdAt: db.systemPushConfig?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  db.systemPushConfig = newConfig;
  await writeJsonDb(db);
  return newConfig;
}

async function updateSystemPushConfigTestStatusUnlocked(
  status: string,
  testedAt = new Date().toISOString()
): Promise<void> {
  const db = await readJsonDb();
  if (db.systemPushConfig) {
    db.systemPushConfig.lastTestedAt = testedAt;
    db.systemPushConfig.lastTestStatus = status;
    db.systemPushConfig.updatedAt = testedAt;
    await writeJsonDb(db);
  }
}

async function getSystemPushAuditLogsUnlocked(limit = 50): Promise<SystemPushAuditLog[]> {
  const db = await readJsonDb();
  const logs = db.systemPushAuditLogs || [];
  return [...logs].sort((a, b) => b.id - a.id).slice(0, limit);
}

async function addSystemPushAuditLogUnlocked(
  adminEmail: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  const db = await readJsonDb();
  if (!db.systemPushAuditLogs) db.systemPushAuditLogs = [];
  const log: SystemPushAuditLog = {
    id: nextId(db.systemPushAuditLogs),
    adminEmail,
    action,
    details: details || null,
    createdAt: new Date().toISOString(),
  };
  db.systemPushAuditLogs.push(log);
  await writeJsonDb(db);
}

async function saveSystemTestDeviceUnlocked(
  subscription: PushSubscriptionRecord,
  userAgent?: string
): Promise<SystemPushTestDevice> {
  const db = await readJsonDb();
  if (!db.systemPushTestDevices) db.systemPushTestDevices = [];
  const endpointHash = subscriptionHash(subscription.endpoint);
  const timestamp = new Date().toISOString();

  let existing = db.systemPushTestDevices.find((d) => d.endpointHash === endpointHash);
  if (existing) {
    existing.subscription = subscription;
    existing.userAgent = userAgent?.slice(0, 500);
    existing.updatedAt = timestamp;
  } else {
    existing = {
      id: nextId(db.systemPushTestDevices),
      endpointHash,
      subscription,
      userAgent: userAgent?.slice(0, 500),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db.systemPushTestDevices.push(existing);
  }
  await writeJsonDb(db);
  return existing;
}

async function getSystemTestDeviceUnlocked(): Promise<SystemPushTestDevice | null> {
  const db = await readJsonDb();
  const devices = db.systemPushTestDevices || [];
  if (!devices.length) return null;
  return [...devices].sort((a, b) => b.id - a.id)[0] || null;
}
