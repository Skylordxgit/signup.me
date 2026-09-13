import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { hasMysqlConfig, mysqlQuery } from './mysql';

export type SignupSettings = {
  enabled: boolean;
};

const settingKey = 'signup_settings';
const defaultSettings: SignupSettings = { enabled: true };

function file() {
  return path.join(process.cwd(), 'data', 'signup-settings.json');
}

function normalize(input: Partial<SignupSettings> | null | undefined): SignupSettings {
  return { enabled: input?.enabled !== false };
}

async function readJsonSettings(): Promise<SignupSettings> {
  try {
    return normalize(JSON.parse(await readFile(file(), 'utf8')) as Partial<SignupSettings>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings;
    throw error;
  }
}

async function writeJsonSettings(settings: SignupSettings) {
  const target = file();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await rename(temporary, target);
}

export async function getSignupSettings(): Promise<SignupSettings> {
  if (hasMysqlConfig()) {
    const rows = await mysqlQuery<{ setting_value: unknown }[]>('SELECT setting_value FROM settings WHERE setting_key = ?', [settingKey]);
    const value = rows[0]?.setting_value;
    return normalize(typeof value === 'string' ? JSON.parse(value) as Partial<SignupSettings> : value as Partial<SignupSettings> | undefined);
  }
  return readJsonSettings();
}

export async function saveSignupSettings(input: Partial<SignupSettings>): Promise<SignupSettings> {
  const current = await getSignupSettings();
  const settings = normalize({ ...current, ...input });
  if (hasMysqlConfig()) {
    await mysqlQuery(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [settingKey, JSON.stringify(settings)],
    );
  } else {
    await writeJsonSettings(settings);
  }
  return settings;
}

export async function isSignupEnabled() {
  return (await getSignupSettings()).enabled;
}
