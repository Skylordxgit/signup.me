import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';
import { isValidImageUrl } from './utils';
import { defaultBranding, type BrandingSettings } from './brandingConstants';

export { defaultBranding };
export type { BrandingSettings };

const settingKey = 'global_branding';

/* The root layout awaits getBranding() in generateMetadata, so this runs on
   every route render, including each client-side navigation. Reading storage
   every time put a database round trip in front of every navigation, and a slow
   or unreachable database blocked or broke the route outright. So: serve a
   short-lived process cache, never wait long, and never throw. */
const cacheTtlMs = 30_000;
const readTimeoutMs = 1_500;
/* A storage read that fails or times out parks the fallback briefly, so a
   broken database costs one slow read rather than one per navigation. A read
   that lands later still overwrites this with the real branding. */
const failureBackoffMs = 5_000;
let cached: { value: BrandingSettings; expiresAt: number } | null = null;
let inFlight: Promise<BrandingSettings> | null = null;

function file() {
  return path.join(process.cwd(), 'data', 'branding.json');
}

function normalize(input: Partial<BrandingSettings> | null | undefined): BrandingSettings {
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : defaultBranding.name;
  const siteTitle = typeof input?.siteTitle === 'string' && input.siteTitle.trim() ? input.siteTitle.trim().slice(0, 140) : defaultBranding.siteTitle;
  const logo = typeof input?.logo === 'string' && input.logo.trim() && isValidImageUrl(input.logo.trim()) ? input.logo.trim() : defaultBranding.logo;
  const favicon = typeof input?.favicon === 'string' && input.favicon.trim() && isValidImageUrl(input.favicon.trim()) ? input.favicon.trim() : defaultBranding.favicon;
  const signupEnabled = typeof input?.signupEnabled === 'boolean' ? input.signupEnabled : defaultBranding.signupEnabled;
  return { name, siteTitle, logo, favicon, signupEnabled };
}

async function readJsonBranding() {
  try {
    return normalize(JSON.parse(await readFile(file(), 'utf8')) as Partial<BrandingSettings>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultBranding;
    throw error;
  }
}

async function writeJsonBranding(branding: BrandingSettings) {
  const target = file();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(branding, null, 2), { mode: 0o600 });
  await rename(temporary, target);
}

/** Reads storage directly, with no cache in front. */
async function readBranding(): Promise<BrandingSettings> {
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<{ setting_value: unknown }[]>('SELECT setting_value FROM settings WHERE setting_key = ?', [settingKey]);
    const value = rows[0]?.setting_value;
    return normalize(typeof value === 'string' ? JSON.parse(value) as Partial<BrandingSettings> : value as Partial<BrandingSettings> | undefined);
  }
  return readJsonBranding();
}

/** One shared read per burst, caching only a success. A read that fails or
 *  outruns the timeout still populates the cache if it lands later. */
function startRead() {
  inFlight ??= readBranding()
    .then(value => {
      cached = { value, expiresAt: Date.now() + cacheTtlMs };
      return value;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Branding for a page render. Always resolves quickly and never rejects:
 * whatever is known is returned, falling back to the built-in brand, so
 * branding storage can never delay or break a navigation.
 */
export async function getBranding(): Promise<BrandingSettings> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const read = startRead();
  const timeout = new Promise<null>(resolve => {
    const timer = setTimeout(() => resolve(null), readTimeoutMs);
    // Do not hold the process open just to time a branding read out.
    timer.unref?.();
  });

  try {
    const value = await Promise.race([read, timeout]);
    if (value) return value;
  } catch { /* Fall through to whatever branding is already known. */ }

  const fallback = cached?.value ?? defaultBranding;
  cached = { value: fallback, expiresAt: Date.now() + failureBackoffMs };
  return fallback;
}

/** Drops the cache so a save is visible on the very next render. */
export function invalidateBranding() {
  cached = null;
}

export async function saveBranding(input: Partial<BrandingSettings>): Promise<BrandingSettings> {
  // Merge onto storage rather than a possibly stale cached copy.
  const current = await readBranding();
  const branding = normalize({ ...current, ...input });
  if (hasMysqlConfig()) {
    await mysqlQuery(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [settingKey, JSON.stringify(branding)],
    );
  } else {
    await writeJsonBranding(branding);
  }
  cached = { value: branding, expiresAt: Date.now() + cacheTtlMs };
  return branding;
}
