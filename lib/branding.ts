import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';
import { isValidImageUrl } from './utils';

export type BrandingSettings = {
  name: string;
  siteTitle: string;
  logo: string;
  favicon: string;
};

export const defaultBranding: BrandingSettings = {
  name: 'signup888',
  siteTitle: 'signup888 - Your Link. Your World.',
  logo: '/signup888-logo.png',
  favicon: '/favicon.ico',
};

const settingKey = 'global_branding';

function file() {
  return path.join(process.cwd(), 'data', 'branding.json');
}

function normalize(input: Partial<BrandingSettings> | null | undefined): BrandingSettings {
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : defaultBranding.name;
  const siteTitle = typeof input?.siteTitle === 'string' && input.siteTitle.trim() ? input.siteTitle.trim().slice(0, 140) : defaultBranding.siteTitle;
  const logo = typeof input?.logo === 'string' && input.logo.trim() && isValidImageUrl(input.logo.trim()) ? input.logo.trim() : defaultBranding.logo;
  const favicon = typeof input?.favicon === 'string' && input.favicon.trim() && isValidImageUrl(input.favicon.trim()) ? input.favicon.trim() : defaultBranding.favicon;
  return { name, siteTitle, logo, favicon };
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

export async function getBranding(): Promise<BrandingSettings> {
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<{ setting_value: unknown }[]>('SELECT setting_value FROM settings WHERE setting_key = ?', [settingKey]);
    const value = rows[0]?.setting_value;
    return normalize(typeof value === 'string' ? JSON.parse(value) as Partial<BrandingSettings> : value as Partial<BrandingSettings> | undefined);
  }
  return readJsonBranding();
}

export async function saveBranding(input: Partial<BrandingSettings>): Promise<BrandingSettings> {
  const current = await getBranding();
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
  return branding;
}
