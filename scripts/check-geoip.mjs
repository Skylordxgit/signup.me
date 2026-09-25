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
  const dbType = reader.metadata.databaseType;
  if (!dbType.includes('City')) throw new Error('Expected City database, got: ' + dbType);

  const testIps = [
    { label: 'London, UK', ip: '81.2.69.160' },
    { label: 'Mumbai, India (Test IP 1)', ip: '103.21.244.1' },
    { label: 'India Broadband (Test IP 2)', ip: '49.32.0.1' },
  ];

  console.log({
    database: 'Loaded',
    bytes: info.size,
    edition: dbType,
    ipVersion: reader.metadata.ipVersion,
    buildEpoch: new Date(Number(reader.metadata.buildEpoch) * 1000).toISOString(),
  });

  for (const testCase of testIps) {
    const raw = reader.get(testCase.ip);
    const country = raw?.country?.names?.en || raw?.registered_country?.names?.en || 'Unknown';
    const countryCode = raw?.country?.iso_code || raw?.registered_country?.iso_code || '';
    const region = raw?.subdivisions?.[0]?.names?.en || 'Unknown';
    const regionCode = raw?.subdivisions?.[0]?.iso_code || '';
    const city = raw?.city?.names?.en || 'Unknown';
    const timeZone = raw?.location?.time_zone || '';

    console.log(`\n--- Test IP: ${testCase.ip} (${testCase.label}) ---`);
    console.log({
      lookupSucceeded: Boolean(countryCode),
      country,
      countryCode,
      region,
      regionCode,
      city,
      timeZone,
      hasSubdivisions: Boolean(raw?.subdivisions?.length),
      rawSubdivision0: raw?.subdivisions?.[0],
      rawCity: raw?.city,
    });
  }
} catch (error) {
  console.error({ database: 'Unavailable', code: error.code || 'INVALID_DATABASE', error: error.message });
  process.exitCode = 1;
}
