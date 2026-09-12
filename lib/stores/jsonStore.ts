import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { AnalyticsReport, BlockType, NotificationSendInput, NotificationSendResult, NotificationSubscriber, NotificationSubscriberSummary, PageBlock, PageStatus, PushSubscriptionRecord, SmartPage } from "../types";
import type { SubscriberDetails } from '../types';
import { subscriberListItem } from '../subscriberDetails';
import { defaultTheme, seedPages } from "../defaults";
import { detectDevice, emptyBlock, isValidSlug, isValidImageUrl, isValidUrl, nowIso, safeReferrer, slugify, summarizePage } from "../utils";
import { configureWebPush, notificationPayload, sendPushBatch } from "../push";
import { DEFAULT_WORKSPACE_ID } from "../workspaces";

type DatabaseShape = {
  pages: SmartPage[];
  pageViews: { id: number; pageId: number; date: string; device: string; referrer: string; visitorKey: string }[];
  linkClicks: { id: number; pageId: number; blockId: number; date: string; device: string; referrer: string }[];
  pushSubscriptions: (NotificationSubscriber & { subscription: PushSubscriptionRecord })[];
};

/* Resolved per call rather than at import, so the working directory in effect
   when the store is used decides the file. */
function dataFile() {
  return path.join(process.cwd(), "data", "db.json");
}

async function readJsonDb(): Promise<DatabaseShape> {
  try {
    const file = await fs.readFile(dataFile(), "utf8");
    const db = JSON.parse(file) as Partial<DatabaseShape>;
    return {
      pages: db.pages ?? [],
      pageViews: db.pageViews ?? [],
      linkClicks: db.linkClicks ?? [],
      pushSubscriptions: db.pushSubscriptions ?? [],
    };
  } catch {
    const initial: DatabaseShape = { pages: seedPages(), pageViews: [], linkClicks: [], pushSubscriptions: [] };
    await writeJsonDb(initial);
    return initial;
  }
}

async function writeJsonDb(db: DatabaseShape) {
  const target = dataFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(db, null, 2));
}

function nextId(items: { id: number }[]) {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

function nextBlockId(pages: SmartPage[]) {
  return nextId(pages.flatMap((page) => page.blocks));
}

function sortBlocks(page: SmartPage) {
  // Pages stored before workspaces existed belong to the default workspace.
  return { ...page, workspaceId: page.workspaceId || DEFAULT_WORKSPACE_ID, blocks: [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder) };
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

export async function getPageById(id: number) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === id);
  return page ? sortBlocks(page) : null;
}

export async function getPublicPageBySlug(slug: string) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published");
  return page ? sortBlocks(page) : null;
}

export async function createPage(input: {
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
  };

  db.pages.push(page);
  await writeJsonDb(db);
  return sortBlocks(page);
}

export async function updatePage(id: number, patch: Partial<SmartPage>) {
  const db = await readJsonDb();
  const index = db.pages.findIndex((page) => page.id === id);
  if (index === -1) return null;

  const nextSlug = patch.slug ? slugify(patch.slug) : db.pages[index].slug;
  if (!isValidSlug(nextSlug)) throw new Error("Invalid slug");
  if (db.pages.some((page) => page.id !== id && page.slug === nextSlug)) throw new Error("Slug already exists");

  const status = patch.status as PageStatus | undefined;
  if (status && !["published", "draft", "disabled"].includes(status)) throw new Error("Invalid status");
  if (patch.profileImage && !isValidImageUrl(patch.profileImage)) throw new Error("Invalid profile image URL");
  if (patch.logoImage && !isValidImageUrl(patch.logoImage)) throw new Error("Invalid logo image URL");
  if (patch.theme?.backgroundImage && !isValidImageUrl(patch.theme.backgroundImage)) throw new Error("Invalid cover image URL");
  if (patch.seo?.ogImage && !isValidImageUrl(patch.seo.ogImage)) throw new Error("Invalid social image URL");
  if (patch.seo?.favicon && !isValidImageUrl(patch.seo.favicon)) throw new Error("Invalid favicon URL");

  db.pages[index] = {
    ...db.pages[index],
    ...patch,
    // The owning workspace is not editable through the page API.
    workspaceId: db.pages[index].workspaceId || DEFAULT_WORKSPACE_ID,
    slug: nextSlug,
    updatedAt: nowIso(),
    blocks: patch.blocks ?? db.pages[index].blocks,
  };

  await writeJsonDb(db);
  return sortBlocks(db.pages[index]);
}

export async function deletePage(id: number) {
  const db = await readJsonDb();
  const before = db.pages.length;
  db.pages = db.pages.filter((page) => page.id !== id);
  await writeJsonDb(db);
  return db.pages.length !== before;
}

export async function duplicatePage(id: number) {
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
  };

  db.pages.push(duplicate);
  await writeJsonDb(db);
  return sortBlocks(duplicate);
}

export async function createBlock(pageId: number, type: BlockType) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
  if (!page) return null;

  const block = { ...emptyBlock(pageId, type, page.blocks.length + 1), id: nextBlockId(db.pages) };
  page.blocks.push(block);
  page.updatedAt = nowIso();
  await writeJsonDb(db);
  return block;
}

/** The page a block belongs to, so routes can check the workspace before
 *  touching it. Returns null when the block does not exist. */
export async function blockPageId(id: number) {
  const db = await readJsonDb();
  return db.pages.find((page) => page.blocks.some((block) => block.id === id))?.id ?? null;
}

export async function updateBlock(id: number, patch: Partial<PageBlock>) {
  const db = await readJsonDb();
  for (const page of db.pages) {
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index === -1) continue;

    if (patch.url && !isValidUrl(patch.url) && !patch.url.includes("@") && !patch.url.startsWith("@")) {
      throw new Error("Invalid URL");
    }

    page.blocks[index] = { ...page.blocks[index], ...patch, updatedAt: nowIso() };
    page.updatedAt = nowIso();
    await writeJsonDb(db);
    return page.blocks[index];
  }
  return null;
}

export async function deleteBlock(id: number) {
  const db = await readJsonDb();
  for (const page of db.pages) {
    const index = page.blocks.findIndex((block) => block.id === id);
    if (index !== -1) {
      page.blocks.splice(index, 1);
      page.blocks = page.blocks.map((block, blockIndex) => ({ ...block, sortOrder: blockIndex + 1 }));
      page.updatedAt = nowIso();
      await writeJsonDb(db);
      return true;
    }
  }
  return false;
}

export async function duplicateBlock(id: number) {
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
    return duplicate;
  }
  return null;
}

export async function reorderBlocks(pageId: number, blockIds: number[]) {
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
  return sortBlocks(page);
}

export async function trackView(slug: string, userAgent: string, referrer: string | null, visitorKey: string) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published");
  if (!page) return null;

  page.views += 1;
  if (!db.pageViews.some((view) => view.pageId === page.id && view.visitorKey === visitorKey)) {
    page.uniqueVisitors += 1;
  }
  db.pageViews.push({
    id: nextId(db.pageViews),
    pageId: page.id,
    date: nowIso(),
    device: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
    visitorKey,
  });
  await writeJsonDb(db);
  return { ok: true };
}

export async function trackClick(pageId: number, blockId: number, userAgent: string, referrer: string | null) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
  const block = page?.blocks.find((item) => item.id === blockId);
  if (!page || !block) return null;

  block.clicks += 1;
  db.linkClicks.push({
    id: nextId(db.linkClicks),
    pageId,
    blockId,
    date: nowIso(),
    device: detectDevice(userAgent),
    referrer: safeReferrer(referrer),
  });
  await writeJsonDb(db);
  return { ok: true };
}

export async function analyticsForPage(pageId: number): Promise<AnalyticsReport | null> {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.id === pageId);
  if (!page) return null;

  const clicks = page.blocks.reduce((sum, block) => sum + block.clicks, 0);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });

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
      views: db.pageViews.filter((view) => view.pageId === pageId && view.date.startsWith(date)).length,
      clicks: db.linkClicks.filter((click) => click.pageId === pageId && click.date.startsWith(date)).length,
    })),
    devices: ["mobile", "desktop", "tablet"].map((device) => ({
      device,
      count: db.pageViews.filter((view) => view.pageId === pageId && view.device === device).length,
    })),
    referrers: Object.entries(
      db.pageViews
        .filter((view) => view.pageId === pageId)
        .reduce<Record<string, number>>((acc, view) => {
          acc[view.referrer] = (acc[view.referrer] ?? 0) + 1;
          return acc;
        }, {}),
    ).map(([referrer, count]) => ({ referrer, count })),
  };
}

function subscriptionHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function savePushSubscription(slug: string, subscription: PushSubscriptionRecord, userAgent: string, details?: SubscriberDetails) {
  const db = await readJsonDb();
  const page = db.pages.find((item) => item.slug === slug && item.status === "published");
  if (!page) return null;

  const timestamp = nowIso();
  const endpointHash = subscriptionHash(subscription.endpoint);
  const existing = db.pushSubscriptions.find((item) => item.endpointHash === endpointHash);
  if (existing) {
    existing.pageId = page.id;
    existing.slug = page.slug;
    existing.subscription = subscription;
    existing.userAgent = userAgent.slice(0, 500);
    if (details) existing.details = details;
    existing.isActive = true;
    existing.lastFailedAt = null;
    existing.updatedAt = timestamp;
    await writeJsonDb(db);
    return existing;
  }

  const subscriber = {
    id: nextId(db.pushSubscriptions),
    pageId: page.id,
    slug: page.slug,
    endpointHash,
    subscription,
    userAgent: userAgent.slice(0, 500),
    details,
    isActive: true,
    lastFailedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.pushSubscriptions.push(subscriber);
  await writeJsonDb(db);
  return subscriber;
}

export async function listPushSubscribers(workspaceId?: string): Promise<NotificationSubscriberSummary> {
  const db = await readJsonDb();
  // Subscribers stay scoped to their page, and so to that page's workspace.
  const owned = (pageId: number) => !workspaceId || inWorkspace(db.pages.find(page => page.id === pageId) ?? ({} as SmartPage), workspaceId);
  const subscriptions = db.pushSubscriptions.filter(item => owned(item.pageId));
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

export async function sendPushNotification(input: NotificationSendInput): Promise<NotificationSendResult> {
  configureWebPush();
  const db = await readJsonDb();
  const subscribers = db.pushSubscriptions.filter((item) =>
    item.isActive !== false
    && (!input.pageId || item.pageId === input.pageId)
    && (!input.workspaceId || inWorkspace(db.pages.find(page => page.id === item.pageId) ?? ({} as SmartPage), input.workspaceId)));
  const { result, expired } = await sendPushBatch(subscribers.map(item => item.subscription), notificationPayload(input));
  if (expired.length) {
    const hashes = new Set(expired.map(subscriptionHash));
    // Re-read after delivery so subscribers added while sending are retained.
    const latest = await readJsonDb();
    const timestamp = nowIso();
    latest.pushSubscriptions = latest.pushSubscriptions.map(item => hashes.has(item.endpointHash) ? { ...item, isActive: false, lastFailedAt: timestamp, updatedAt: timestamp } : item);
    await writeJsonDb(latest);
  }

  return result;
}
