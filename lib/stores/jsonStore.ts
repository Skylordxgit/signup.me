import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { AnalyticsReport, BlockType, CityDetailMetric, CountryDetailMetric, NotificationCampaign, NotificationSendInput, NotificationSendResult, NotificationSubscriber, NotificationSubscriberSummary, PageBlock, PageStatus, PushSubscriptionRecord, RecentActivityItem, SmartPage } from "../types";
import type { SubscriberDetails } from '../types';
import { subscriberListItem } from '../subscriberDetails';
import { defaultTheme, seedPages } from "../defaults";
import { detectDevice, emptyBlock, isValidSlug, isValidImageUrl, isValidUrl, nowIso, safeReferrer, slugify, summarizePage } from "../utils";
import { configureWebPush, notificationPayload, sendPushBatch } from "../push";
import { DEFAULT_WORKSPACE_ID } from "../workspaces";

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
    countryCode?: string;
    country?: string;
    regionCode?: string;
    region?: string;
    city?: string;
    timezone?: string;
    location?: string;
  }[];
  linkClicks: {
    id: number;
    workspaceId: string;
    pageId: number;
    blockId: number;
    date: string;
    device: string;
    referrer: string;
    countryCode?: string;
    country?: string;
    regionCode?: string;
    region?: string;
    city?: string;
    timezone?: string;
    location?: string;
  }[];
  pushSubscriptions: (NotificationSubscriber & { subscription: PushSubscriptionRecord })[];
  notificationCampaigns: NotificationCampaign[];
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
export const savePushSubscription = serialized(savePushSubscriptionUnlocked);
export const sendPushNotification = serialized(sendPushNotificationUnlocked);
export const recordNotificationCampaignEvent = serialized(recordNotificationCampaignEventUnlocked);

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
      pushSubscriptions: (db.pushSubscriptions ?? []).map(scope),
      notificationCampaigns: db.notificationCampaigns ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initial: DatabaseShape = { pages: seedPages(), pageViews: [], linkClicks: [], pushSubscriptions: [], notificationCampaigns: [] };
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
  return { ...page, workspaceId, blocks: page.blocks.map(block => ({ ...block, workspaceId })).sort((a, b) => a.sortOrder - b.sortOrder) };
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
  };

  db.pages.push(page);
  await writeJsonDb(db);
  return sortBlocks(page);
}

async function updatePageUnlocked(id: number, patch: Partial<SmartPage>) {
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
    id: db.pages[index].id,
    // The owning workspace is not editable through the page API.
    workspaceId: db.pages[index].workspaceId || DEFAULT_WORKSPACE_ID,
    slug: nextSlug,
    updatedAt: nowIso(),
    blocks: db.pages[index].blocks,
  };

  await writeJsonDb(db);
  return sortBlocks(db.pages[index]);
}

async function deletePageUnlocked(id: number) {
  const db = await readJsonDb();
  const before = db.pages.length;
  db.pages = db.pages.filter((page) => page.id !== id);
  db.pageViews = db.pageViews.filter(row => row.pageId !== id);
  db.linkClicks = db.linkClicks.filter(row => row.pageId !== id);
  db.pushSubscriptions = db.pushSubscriptions.filter(row => row.pageId !== id);
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
  };

  db.pages.push(duplicate);
  await writeJsonDb(db);
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
  geoDetails?: { countryCode?: string; regionCode?: string; region?: string; timezone?: string },
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
    countryCode: geoDetails?.countryCode || '',
    country,
    regionCode: geoDetails?.regionCode || '',
    region: geoDetails?.region || '',
    city,
    timezone: geoDetails?.timezone || '',
    location,
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
  geoDetails?: { countryCode?: string; regionCode?: string; region?: string; timezone?: string },
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
    countryCode: geoDetails?.countryCode || '',
    country,
    regionCode: geoDetails?.regionCode || '',
    region: geoDetails?.region || '',
    city,
    timezone: geoDetails?.timezone || '',
    location,
  });
  await writeJsonDb(db);
  return { ok: true };
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

  const totalViews = daysInput === 'all' && !fromDate ? page.views : viewsInRange.length;
  const totalClicks = daysInput === 'all' && !fromDate ? page.blocks.reduce((sum, block) => sum + block.clicks, 0) : clicksInRange.length;

  const uniqueVisitorsSet = new Set(viewsInRange.map(v => v.visitorKey));
  const uniqueVisitors = daysInput === 'all' && !fromDate ? page.uniqueVisitors : uniqueVisitorsSet.size;

  const blockClicksMap = new Map<number, number>();
  for (const click of clicksInRange) {
    blockClicksMap.set(click.blockId, (blockClicksMap.get(click.blockId) || 0) + 1);
  }

  // Location aggregations for link clicks and views
  const locationMap = new Map<string, { location: string; country: string; city: string; views: number; clicks: number }>();
  for (const view of viewsInRange) {
    const loc = view.location || view.country || 'Direct / Local';
    const current = locationMap.get(loc) || { location: loc, country: view.country || '', city: view.city || '', views: 0, clicks: 0 };
    current.views += 1;
    locationMap.set(loc, current);
  }
  for (const click of clicksInRange) {
    const loc = click.location || click.country || 'Direct / Local';
    const current = locationMap.get(loc) || { location: loc, country: click.country || '', city: click.city || '', views: 0, clicks: 0 };
    current.clicks += 1;
    locationMap.set(loc, current);
  }

  // Link click details by block and location
  const linkLocationsMap = new Map<string, { blockId: number; blockTitle: string; location: string; country: string; city: string; clicks: number }>();
  for (const click of clicksInRange) {
    const block = page.blocks.find(b => b.id === click.blockId);
    const blockTitle = block?.title || `Block #${click.blockId}`;
    const loc = click.location || click.country || 'Direct / Local';
    const key = `${click.blockId}:${loc}`;
    const current = linkLocationsMap.get(key) || { blockId: click.blockId, blockTitle, location: loc, country: click.country || '', city: click.city || '', clicks: 0 };
    current.clicks += 1;
    linkLocationsMap.set(key, current);
  }

  // In-depth Country, Region, and City Hierarchy
  type CityAcc = {
    city: string;
    region: string;
    regionCode: string;
    country: string;
    countryCode: string;
    location: string;
    views: number;
    clicks: number;
    links: Map<number, { blockId: number; blockTitle: string; clicks: number }>;
  };
  type RegionAcc = {
    regionCode: string;
    regionName: string;
    countryCode: string;
    countryName: string;
    views: number;
    clicks: number;
    cities: Map<string, CityAcc>;
  };
  type CountryAcc = {
    countryCode: string;
    countryName: string;
    views: number;
    clicks: number;
    regions: Map<string, RegionAcc>;
    cities: Map<string, CityAcc>;
  };

  const countriesAcc = new Map<string, CountryAcc>();

  function getOrInitHierarchy(
    rawCountry?: string,
    rawCountryCode?: string,
    rawRegion?: string,
    rawRegionCode?: string,
    rawCity?: string,
  ): { country: CountryAcc; region: RegionAcc; city: CityAcc } {
    const cName = rawCountry || 'Direct / Local';
    const cCode = rawCountryCode || (cName.length === 2 ? cName.toUpperCase() : '');
    let countryItem = countriesAcc.get(cName);
    if (!countryItem) {
      countryItem = {
        countryCode: cCode,
        countryName: cName,
        views: 0,
        clicks: 0,
        regions: new Map<string, RegionAcc>(),
        cities: new Map<string, CityAcc>(),
      };
      countriesAcc.set(cName, countryItem);
    }

    const rName = rawRegion || 'Direct';
    const rCode = rawRegionCode || '';
    let regionItem = countryItem.regions.get(rName);
    if (!regionItem) {
      regionItem = {
        regionCode: rCode,
        regionName: rName,
        countryCode: cCode,
        countryName: cName,
        views: 0,
        clicks: 0,
        cities: new Map<string, CityAcc>(),
      };
      countryItem.regions.set(rName, regionItem);
    }

    const cityName = rawCity || 'Direct';
    let cityItem = countryItem.cities.get(cityName);
    if (!cityItem) {
      const locStr = rawCity && rawCountry && rawCity !== rawCountry
        ? `${rawCity}, ${rawCountry}`
        : (rawCity || rawCountry || 'Direct / Local');
      cityItem = {
        city: cityName,
        region: rName,
        regionCode: rCode,
        country: cName,
        countryCode: cCode,
        location: locStr,
        views: 0,
        clicks: 0,
        links: new Map<number, { blockId: number; blockTitle: string; clicks: number }>(),
      };
      countryItem.cities.set(cityName, cityItem);
    }

    if (!regionItem.cities.has(cityName)) {
      regionItem.cities.set(cityName, cityItem);
    }

    return { country: countryItem, region: regionItem, city: cityItem };
  }

  for (const view of viewsInRange) {
    const cName = view.country || (view.location && view.location.includes(',') ? view.location.split(',')[1].trim() : view.location) || 'Direct / Local';
    const cityName = view.city || (view.location && view.location.includes(',') ? view.location.split(',')[0].trim() : '');
    const { country, region, city } = getOrInitHierarchy(cName, view.countryCode, view.region, view.regionCode, cityName);
    country.views += 1;
    region.views += 1;
    city.views += 1;
  }

  for (const click of clicksInRange) {
    const cName = click.country || (click.location && click.location.includes(',') ? click.location.split(',')[1].trim() : click.location) || 'Direct / Local';
    const cityName = click.city || (click.location && click.location.includes(',') ? click.location.split(',')[0].trim() : '');
    const { country, region, city } = getOrInitHierarchy(cName, click.countryCode, click.region, click.regionCode, cityName);
    country.clicks += 1;
    region.clicks += 1;
    city.clicks += 1;

    const block = page.blocks.find(b => b.id === click.blockId);
    const blockTitle = block?.title || `Block #${click.blockId}`;
    const linkItem = city.links.get(click.blockId) || { blockId: click.blockId, blockTitle, clicks: 0 };
    linkItem.clicks += 1;
    city.links.set(click.blockId, linkItem);
  }

  const countriesResult: CountryDetailMetric[] = [...countriesAcc.values()].map(c => {
    const citiesList: CityDetailMetric[] = [...c.cities.values()].map(ct => ({
      city: ct.city,
      region: ct.region,
      regionCode: ct.regionCode,
      country: ct.country,
      countryCode: ct.countryCode,
      location: ct.location,
      views: ct.views,
      clicks: ct.clicks,
      ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
      topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
    })).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));

    const regionsList: RegionDetailMetric[] = [...c.regions.values()].map(r => ({
      regionCode: r.regionCode,
      regionName: r.regionName,
      countryCode: r.countryCode,
      countryName: r.countryName,
      views: r.views,
      clicks: r.clicks,
      ctr: r.views > 0 ? Number(((r.clicks / r.views) * 100).toFixed(1)) : (r.clicks > 0 ? 100 : 0),
      cities: [...r.cities.values()].map(ct => ({
        city: ct.city,
        region: ct.region,
        regionCode: ct.regionCode,
        country: ct.country,
        countryCode: ct.countryCode,
        location: ct.location,
        views: ct.views,
        clicks: ct.clicks,
        ctr: ct.views > 0 ? Number(((ct.clicks / ct.views) * 100).toFixed(1)) : (ct.clicks > 0 ? 100 : 0),
        topLinks: [...ct.links.values()].sort((a, b) => b.clicks - a.clicks),
      })).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views)),
    })).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));

    return {
      countryCode: c.countryCode,
      countryName: c.countryName,
      views: c.views,
      clicks: c.clicks,
      ctr: c.views > 0 ? Number(((c.clicks / c.views) * 100).toFixed(1)) : (c.clicks > 0 ? 100 : 0),
      regions: regionsList,
      cities: citiesList,
    };
  }).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views));

  // Recent activity stream (top 30 newest events)
  const recentEvents: RecentActivityItem[] = [];
  for (const view of viewsInRange) {
    recentEvents.push({
      id: `v-${view.id}`,
      type: 'view',
      pageId: view.pageId,
      pageName: page.name,
      country: view.country || '',
      city: view.city || '',
      location: view.location || view.country || 'Direct / Local',
      device: view.device || 'desktop',
      referrer: view.referrer || 'Direct',
      date: view.date,
    });
  }
  for (const click of clicksInRange) {
    const block = page.blocks.find(b => b.id === click.blockId);
    recentEvents.push({
      id: `c-${click.id}`,
      type: 'click',
      pageId: click.pageId,
      pageName: page.name,
      blockId: click.blockId,
      blockTitle: block?.title || `Block #${click.blockId}`,
      country: click.country || '',
      city: click.city || '',
      location: click.location || click.country || 'Direct / Local',
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
    clicks: totalClicks,
    ctr: totalViews ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0,
    topBlocks: [...page.blocks]
      .map((block) => ({ id: block.id, title: block.title, clicks: blockClicksMap.get(block.id) ?? block.clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5),
    daily: days.map((date) => ({
      date,
      views: viewsInRange.filter((view) => view.date.startsWith(date)).length,
      clicks: clicksInRange.filter((click) => click.date.startsWith(date)).length,
    })),
    devices: ["mobile", "desktop", "tablet"].map((device) => ({
      device,
      count: viewsInRange.filter((view) => view.device === device).length,
    })),
    referrers: Object.entries(
      viewsInRange.reduce<Record<string, number>>((acc, view) => {
        acc[view.referrer] = (acc[view.referrer] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([referrer, count]) => ({ referrer, count })).sort((a, b) => b.count - a.count),
    locations: [...locationMap.values()].sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views)),
    linkLocations: [...linkLocationsMap.values()].sort((a, b) => b.clicks - a.clicks),
    countries: countriesResult,
    recentActivity,
    days: daysInput,
    startDate,
    endDate,
  };
}

function subscriptionHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

async function savePushSubscriptionUnlocked(slug: string, subscription: PushSubscriptionRecord, userAgent: string, details?: SubscriberDetails, workspaceId?: string) {
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
    if (details) existing.details = details;
    existing.isActive = true;
    existing.lastFailedAt = null;
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

function campaignAudience(input: NotificationSendInput, page?: SmartPage) {
  return input.pageId && page ? `/${page.slug}` : 'All subscribers';
}

function normalizeCampaign(campaign: NotificationCampaign): NotificationCampaign {
  const clicked = Number(campaign.clicked ?? campaign.clicks ?? 0);
  return {
    ...campaign,
    pageSlug: campaign.pageSlug ?? null,
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

export async function trackNotificationCampaignClick(campaignId: number) {
  return Boolean(await recordNotificationCampaignEvent(campaignId, 'clicked'));
}

async function sendPushNotificationUnlocked(input: NotificationSendInput): Promise<NotificationSendResult> {
  configureWebPush();
  const db = await readJsonDb();
  const page = input.pageId ? db.pages.find(item => item.id === input.pageId) : undefined;
  const subscribers = db.pushSubscriptions.filter((item) =>
    item.isActive !== false
    && (!input.pageId || item.pageId === input.pageId)
    && (!input.workspaceId || inWorkspace(db.pages.find(page => page.id === item.pageId) ?? ({} as SmartPage), input.workspaceId)));
  const timestamp = nowIso();
  const campaign: NotificationCampaign = {
    id: nextId(db.notificationCampaigns),
    workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
    pageId: input.pageId ?? null,
    pageSlug: page?.slug ?? null,
    title: input.title.trim(),
    body: input.body.trim(),
    url: input.url.trim() || '/',
    audience: campaignAudience(input, page),
    attempted: subscribers.length,
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

  const { result, expired } = await sendPushBatch(subscribers.map(item => item.subscription), notificationPayload({ ...input, campaignId: campaign.id }));
  const latest = await readJsonDb();
  const stored = latest.notificationCampaigns.find(item => item.id === campaign.id);
  if (stored) {
    stored.attempted = result.attempted;
    stored.sent = result.sent;
    stored.removed = result.removed;
    stored.failed = result.failed;
    stored.updatedAt = nowIso();
  }
  if (expired.length) {
    const hashes = new Set(expired.map(subscriptionHash));
    latest.pushSubscriptions = latest.pushSubscriptions.map(item => item.workspaceId === campaign.workspaceId && hashes.has(item.endpointHash) ? { ...item, isActive: false, lastFailedAt: timestamp, updatedAt: timestamp } : item);
  }
  await writeJsonDb(latest);

  return { ...result, campaignId: campaign.id, campaign: stored ?? campaign };
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
