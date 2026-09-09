import type { AdminSession } from './auth';
import { createBlock, createPage, listPages, updateBlock, updatePage } from './store';
import type { BlockType, PageBlock, SeoSettings, SmartPage, ThemeSettings } from './types';
import { blockTypes, isValidImageUrl, isValidUrl, slugify } from './utils';
import { isSafeSvg, isUploadCategory, maxUploadBytes, readUpload, sniffImage, storeUpload, type UploadCategory } from './uploads';
import { pageForSession } from './workspaceAccess';

export const exportKind = 'signup888.pages.export';
export const exportVersion = 1;

/* Bounds so one request cannot exhaust memory or storage. */
const maxPages = 50;
const maxBlocksPerPage = 200;
const maxMediaFiles = 300;

/** A page with everything needed to rebuild it, and nothing tying it to the
 *  workspace, ids, or traffic it came from. */
export type ExportedBlock = {
  type: BlockType;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  phone: string;
  message: string;
  imageUrl: string;
  videoUrl: string;
  settings: Record<string, string | number | boolean>;
  sortOrder: number;
  isActive: boolean;
};

export type ExportedPage = {
  name: string;
  slug: string;
  title: string;
  bio: string;
  profileImage: string;
  logoImage: string;
  status: SmartPage['status'];
  theme: ThemeSettings;
  seo: SeoSettings;
  integrations: SmartPage['integrations'];
  blocks: ExportedBlock[];
};

/** An uploaded file carried inside the export so it survives a move to another
 *  workspace or a fresh server, where the original /uploads path is gone. */
export type ExportedMedia = {
  path: string;
  category: UploadCategory;
  fileName: string;
  mime: string;
  data: string;
};

export type PagesExport = {
  kind: typeof exportKind;
  version: number;
  exportedAt: string;
  pages: ExportedPage[];
  media: ExportedMedia[];
};

export type ImportedPageSummary = { id: number; name: string; slug: string; originalSlug: string; status: SmartPage['status']; renamed: boolean };
export type ImportResult = { pages: ImportedPageSummary[]; media: number; warnings: string[] };

export function exportFileName(date = new Date()) {
  return `signup888-pages-export-${date.toISOString().slice(0, 10)}.json`;
}

const uploadPathPattern = /^\/uploads\/[^/]+\/[^/]+$/;

/** Every stored-upload reference anywhere in the page data, so an image is
 *  carried along wherever it is referenced from — not just the known fields. */
function collectUploadPaths(value: unknown, found: Set<string>) {
  if (typeof value === 'string') {
    if (uploadPathPattern.test(value)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUploadPaths(item, found);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectUploadPaths(item, found);
  }
}

/** Rebuilds the same shape with every stored-upload reference remapped. A
 *  reference with no replacement is cleared rather than left pointing at a file
 *  that does not exist here. */
function rewriteUploadPaths<T>(value: T, replacements: Map<string, string>): T {
  if (typeof value === 'string') {
    if (!uploadPathPattern.test(value)) return value;
    return (replacements.get(value) ?? '') as unknown as T;
  }
  if (Array.isArray(value)) return value.map(item => rewriteUploadPaths(item, replacements)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteUploadPaths(item, replacements)])) as unknown as T;
  }
  return value;
}

function segmentsFor(path: string) {
  const [, , category, name] = path.split('/');
  if (!category || !name || !isUploadCategory(category)) return null;
  // readUpload re-checks these, which is what keeps a crafted path contained.
  return [category, decodeURIComponent(name)];
}

function exportedBlock(block: PageBlock): ExportedBlock {
  return {
    type: block.type,
    title: block.title,
    subtitle: block.subtitle,
    url: block.url,
    icon: block.icon,
    phone: block.phone,
    message: block.message,
    imageUrl: block.imageUrl,
    videoUrl: block.videoUrl,
    settings: block.settings,
    sortOrder: block.sortOrder,
    isActive: block.isActive,
  };
}

/**
 * Builds an export for the given page ids. Only pages in the caller's own
 * workspace are readable, and traffic counters are deliberately left out: an
 * import always starts a page at zero.
 */
export async function exportPages(session: AdminSession, ids: number[]): Promise<PagesExport> {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) throw new Error('Select at least one page to export.');
  if (unique.length > maxPages) throw new Error(`Export up to ${maxPages} pages at a time.`);

  const pages: ExportedPage[] = [];
  const uploadPaths = new Set<string>();

  for (const id of unique) {
    // Resolves inside the session workspace only, so ids cannot reach further.
    const page = await pageForSession(session, id);
    const exported: ExportedPage = {
      name: page.name,
      slug: page.slug,
      title: page.title,
      bio: page.bio,
      profileImage: page.profileImage,
      logoImage: page.logoImage,
      status: page.status,
      theme: page.theme,
      seo: page.seo,
      integrations: page.integrations,
      blocks: [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder).map(exportedBlock),
    };
    collectUploadPaths(exported, uploadPaths);
    pages.push(exported);
  }

  const media: ExportedMedia[] = [];
  for (const path of uploadPaths) {
    if (media.length >= maxMediaFiles) break;
    const segments = segmentsFor(path);
    if (!segments) continue;
    const file = await readUpload(segments);
    // A file that cannot be read is simply not carried; the reference is
    // cleared on import rather than restored as a broken link.
    if (!file) continue;
    media.push({
      path,
      category: segments[0] as UploadCategory,
      fileName: segments[1],
      mime: file.mime,
      data: Buffer.from(file.bytes).toString('base64'),
    });
  }

  return { kind: exportKind, version: exportVersion, exportedAt: new Date().toISOString(), pages, media };
}

function asString(value: unknown, limit = 2000) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** Keeps an image reference only when it passes the same rules the upload and
 *  page APIs enforce; anything else becomes empty. */
function safeImage(value: unknown) {
  const image = asString(value, 700);
  return image && isValidImageUrl(image) ? image : '';
}

/** Mirrors the check updateBlock makes, so one odd link cannot fail an import. */
function safeBlockUrl(value: unknown) {
  const url = asString(value, 700);
  if (!url) return '';
  return isValidUrl(url) || url.includes('@') || url.startsWith('@') ? url : '';
}

function safeSettings(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const settings: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') settings[key.slice(0, 60)] = item.slice(0, 300);
    else if (typeof item === 'number' && Number.isFinite(item)) settings[key.slice(0, 60)] = item;
    else if (typeof item === 'boolean') settings[key.slice(0, 60)] = item;
  }
  return settings;
}

const blockTypeValues = new Set(blockTypes.map(type => type.value));

function parseBlock(value: unknown, index: number): ExportedBlock | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const type = asString(raw.type, 40) as BlockType;
  if (!blockTypeValues.has(type)) return null;
  return {
    type,
    title: asString(raw.title, 190),
    subtitle: asString(raw.subtitle, 255),
    url: safeBlockUrl(raw.url),
    icon: asString(raw.icon, 700),
    phone: asString(raw.phone, 80),
    message: asString(raw.message, 2000),
    imageUrl: asString(raw.imageUrl, 700),
    videoUrl: asString(raw.videoUrl, 700),
    settings: safeSettings(raw.settings),
    sortOrder: typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : index + 1,
    isActive: raw.isActive !== false,
  };
}

/** Validates the envelope before anything is written. */
export function parseExport(value: unknown): PagesExport {
  if (!value || typeof value !== 'object') throw new Error('This file is not a signup888 pages export.');
  const raw = value as Record<string, unknown>;
  if (raw.kind !== exportKind) throw new Error('This file is not a signup888 pages export.');
  if (raw.version !== exportVersion) throw new Error(`This export was made by a different version (${String(raw.version)}). Expected version ${exportVersion}.`);
  if (!Array.isArray(raw.pages) || !raw.pages.length) throw new Error('This export contains no pages.');
  if (raw.pages.length > maxPages) throw new Error(`Imports are limited to ${maxPages} pages per file.`);
  const media = Array.isArray(raw.media) ? raw.media : [];
  if (media.length > maxMediaFiles) throw new Error(`Imports are limited to ${maxMediaFiles} media files per file.`);

  const pages = raw.pages.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('This export contains a page that could not be read.');
    const page = entry as Record<string, unknown>;
    const name = asString(page.name, 190).trim();
    if (!name) throw new Error('This export contains a page with no name.');
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    if (blocks.length > maxBlocksPerPage) throw new Error(`"${name}" has more than ${maxBlocksPerPage} blocks.`);
    return {
      name,
      slug: slugify(asString(page.slug, 120)) || slugify(name),
      title: asString(page.title, 190),
      bio: asString(page.bio, 4000),
      profileImage: safeImage(page.profileImage),
      logoImage: safeImage(page.logoImage),
      status: page.status === 'published' || page.status === 'disabled' ? page.status : 'draft',
      theme: (page.theme && typeof page.theme === 'object' ? page.theme : {}) as ThemeSettings,
      seo: (page.seo && typeof page.seo === 'object' ? page.seo : {}) as SeoSettings,
      integrations: (page.integrations && typeof page.integrations === 'object' ? page.integrations : {}) as SmartPage['integrations'],
      blocks: blocks.map(parseBlock).filter((block): block is ExportedBlock => block !== null),
    } satisfies ExportedPage;
  });

  return { kind: exportKind, version: exportVersion, exportedAt: asString(raw.exportedAt, 40), pages, media: media as ExportedMedia[] };
}

/** Saves the carried files into this workspace's media storage, returning the
 *  old reference -> new reference map used to rewrite the pages. */
async function restoreMedia(workspaceId: string, media: ExportedMedia[], warnings: string[]) {
  const replacements = new Map<string, string>();

  for (const entry of media) {
    const original = typeof entry?.path === 'string' ? entry.path : '';
    const label = original || 'an embedded image';
    if (!uploadPathPattern.test(original)) { warnings.push(`Skipped ${label}: not a stored upload reference.`); continue; }

    const category = asString(entry.category, 20);
    if (!isUploadCategory(category)) { warnings.push(`Skipped ${label}: unknown media category.`); continue; }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(asString(entry.data, 40_000_000), 'base64'));
    } catch { warnings.push(`Skipped ${label}: the embedded file could not be decoded.`); continue; }
    if (!bytes.length) { warnings.push(`Skipped ${label}: the embedded file was empty.`); continue; }
    if (bytes.length > maxUploadBytes) { warnings.push(`Skipped ${label}: larger than the ${Math.round(maxUploadBytes / 1024 / 1024)}MB upload limit.`); continue; }

    // Identified by content, exactly like a direct upload: the declared mime
    // and file name from the file are never trusted.
    const kind = sniffImage(bytes);
    if (!kind) { warnings.push(`Skipped ${label}: unsupported image type.`); continue; }
    if (kind.mime === 'image/svg+xml') {
      if (category !== 'favicon' && category !== 'logo' && category !== 'icon') { warnings.push(`Skipped ${label}: SVG is only allowed for a logo, icon or favicon.`); continue; }
      if (!isSafeSvg(bytes)) { warnings.push(`Skipped ${label}: the SVG contained scripting.`); continue; }
    }
    if (kind.mime === 'image/x-icon' && category !== 'favicon') { warnings.push(`Skipped ${label}: ICO files are only allowed for a favicon.`); continue; }

    // storeUpload names the file itself, so nothing from the export reaches the
    // filesystem path.
    const stored = await storeUpload(category, bytes, kind, workspaceId);
    replacements.set(original, stored.path);
  }

  return replacements;
}

/** Finds a free slug, trying `slug`, then `slug-copy`, `slug-copy-2`, ... */
function slugCandidates(slug: string) {
  const base = slug || 'page';
  return function* () {
    yield base;
    yield `${base}-copy`.slice(0, 70);
    for (let suffix = 2; suffix <= 60; suffix += 1) yield `${base}-copy-${suffix}`.slice(0, 70);
  }();
}

/**
 * Recreates the exported pages inside the caller's workspace.
 *
 * Nothing is ever overwritten: every page and block is created fresh with new
 * ids, the workspace comes from the session rather than the file, and traffic
 * counters start at zero.
 */
export async function importPages(
  session: AdminSession,
  data: PagesExport,
  options: { keepStatus?: boolean } = {},
): Promise<ImportResult> {
  const warnings: string[] = [];
  const replacements = await restoreMedia(session.workspaceId, data.media, warnings);
  const imported: ImportedPageSummary[] = [];

  for (const source of data.pages) {
    const page = rewriteUploadPaths(source, replacements);
    const status = options.keepStatus ? page.status : 'draft';

    let created: SmartPage | null = null;
    let usedSlug = '';
    for (const candidate of slugCandidates(page.slug)) {
      try {
        created = await createPage({ name: page.name, slug: candidate, title: page.title, bio: page.bio, profileImage: page.profileImage, workspaceId: session.workspaceId });
        usedSlug = candidate;
        break;
      } catch (error) {
        // Any other failure is a real problem and should surface.
        if (!(error instanceof Error) || !/slug already exists/i.test(error.message)) throw error;
      }
    }
    if (!created) throw new Error(`Could not find a free address for "${page.name}". Rename the page and try again.`);

    const saved = await updatePage(created.id, {
      logoImage: page.logoImage,
      status,
      theme: page.theme,
      seo: page.seo,
      integrations: page.integrations,
    });

    for (const [index, block] of page.blocks.entries()) {
      const fresh = await createBlock(created.id, block.type);
      if (!fresh) continue;
      await updateBlock(fresh.id, {
        title: block.title,
        subtitle: block.subtitle,
        url: block.url,
        icon: block.icon,
        phone: block.phone,
        message: block.message,
        imageUrl: block.imageUrl,
        videoUrl: block.videoUrl,
        settings: block.settings,
        // Rewritten to the exported order so the page reads the same way.
        sortOrder: index + 1,
        isActive: block.isActive,
        clicks: 0,
      });
    }

    imported.push({
      id: created.id,
      name: saved?.name ?? created.name,
      slug: usedSlug,
      originalSlug: source.slug,
      status,
      renamed: usedSlug !== source.slug,
    });
  }

  // Report the workspace's own list so the caller can refresh confidently.
  await listPages(session.workspaceId);
  return { pages: imported, media: replacements.size, warnings };
}
