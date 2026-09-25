import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { open } from 'maxmind';

// Run only in the server terminal: paths are never returned by a public API.
const configured = process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH;
const file = path.resolve((configured || 'data/GeoLite2-City.mmdb').trim());
console.log({ pathConfigured: Boolean(configured), cwd: process.cwd(), databasePath: file });
try {
  await access(file, constants.R_OK);
  const info = await stat(file);
  const reader = await open(file);
  if (!reader.metadata.databaseType.includes('City')) throw new Error('Expected City database');
  const result = reader.get('81.2.69.160');
  console.log({ database: 'Loaded', bytes: info.size, edition: reader.metadata.databaseType,
    lookupWorking: Boolean(result?.country?.iso_code), country: result?.country?.names?.en,
    region: result?.subdivisions?.[0]?.names?.en, city: result?.city?.names?.en });
  if (!result?.country?.iso_code) process.exitCode = 1;
} catch (error) {
  console.error({ database: 'Unavailable', code: error.code || 'INVALID_DATABASE', error: error.message });
  process.exitCode = 1;
}
