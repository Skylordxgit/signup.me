import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultBranding, getBranding, invalidateBranding, saveBranding } from '../lib/branding';

/* The root layout awaits getBranding() in generateMetadata, so it runs on every
   route render including each client-side navigation. It therefore has to be
   cheap and unable to fail: these cover the cache and the fallback. */
async function withDataDirectory<T>(run: (directory: string) => Promise<T>) {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'signup-branding-'));
  process.chdir(directory);
  invalidateBranding();
  try { return await run(directory); }
  finally { process.chdir(previous); invalidateBranding(); await rm(directory, { recursive: true, force: true }); }
}

test('branding falls back instantly instead of failing when storage is unreadable', async () => {
  await withDataDirectory(async directory => {
    // A directory where the branding file should be makes every read throw.
    await mkdir(path.join(directory, 'data', 'branding.json'), { recursive: true });

    const started = Date.now();
    const branding = await getBranding();
    assert.deepEqual(branding, defaultBranding, 'unreadable storage must still produce usable branding');
    assert.ok(Date.now() - started < 1000, 'a failed read must not stall the render');

    // The failure is parked briefly, so a broken store costs one read, not one
    // per navigation.
    const again = Date.now();
    assert.deepEqual(await getBranding(), defaultBranding);
    assert.ok(Date.now() - again < 50, 'repeat reads after a failure must be served from cache');
  });
});

test('saved branding is served immediately and stays cached for later renders', async () => {
  await withDataDirectory(async () => {
    assert.equal((await getBranding()).name, defaultBranding.name);

    const saved = await saveBranding({ name: 'Acme', siteTitle: 'Acme links' });
    assert.equal(saved.name, 'Acme');

    // A save must be visible on the very next render, not after the cache ages.
    assert.equal((await getBranding()).name, 'Acme');
    assert.equal((await getBranding()).siteTitle, 'Acme links');

    // Untouched fields keep their previous values through a partial save.
    assert.equal((await getBranding()).logo, defaultBranding.logo);
  });
});

test('repeated reads of unchanged branding do not re-read storage', async () => {
  await withDataDirectory(async directory => {
    await mkdir(path.join(directory, 'data'), { recursive: true });
    const file = path.join(directory, 'data', 'branding.json');
    await writeFile(file, JSON.stringify({ ...defaultBranding, name: 'First' }));

    assert.equal((await getBranding()).name, 'First');

    // Changing the file behind the cache must not be picked up until the cache
    // is dropped, which is what keeps navigation off the storage path.
    await writeFile(file, JSON.stringify({ ...defaultBranding, name: 'Second' }));
    assert.equal((await getBranding()).name, 'First', 'a cached read must not touch storage');

    invalidateBranding();
    assert.equal((await getBranding()).name, 'Second');
  });
});
