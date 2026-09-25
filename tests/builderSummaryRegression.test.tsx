import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuilderEditor, type BuilderTab } from '../components/admin/BuilderEditor';
import { seedPages } from '../lib/defaults';
import { summarizePage } from '../lib/utils';
import type { PageSummary } from '../lib/types';
import * as jsonStore from '../lib/stores/jsonStore';
import * as mysqlStore from '../lib/stores/mysqlStore';
import { mysqlPool } from '../lib/mysql';

test('builder refresh consumes summaries, never summarizes them a second time', async () => {
  const route = await readFile(path.join(process.cwd(), 'app/admin/(dashboard)/pages/[id]/edit/page.tsx'), 'utf8');
  assert.match(route, /adminApi<PageSummary\[\]>\("\/api\/pages"\)/);
  assert.doesNotMatch(route, /items\.map\(summarizePage\)/);

  // The dashboard context's page-list refresh must follow the same contract.
  const context = await readFile(path.join(process.cwd(), 'components/admin/AdminContext.tsx'), 'utf8');
  assert.match(context, /adminApi<PageSummary\[\]>\("\/api\/pages"\)/);
  assert.doesNotMatch(context, /\.map\(\s*summarizePage\s*\)/);

  const summary = summarizePage(seedPages()[0]);
  assert.equal('blocks' in summary, false);
  // The old faulty call — feeding a summary back into summarizePage() — crashes
  // because PageSummary carries no blocks. The type system forbids it as well:
  // if this directive ever becomes unused, the contract was weakened and tsc fails.
  // @ts-expect-error PageSummary must never be passed to summarizePage()
  assert.throws(() => summarizePage(summary), /reading 'reduce'/);

  // Summaries flow straight into PageSummary[] state; no second summarization.
  const pages: PageSummary[] = [summary];
  assert.equal(pages.length, 1);
});

test('legacy and current Standard pages render every tab and persist Link/YouTube blocks', async () => {
  const root = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'builder-summary-'));
  const page = seedPages()[0];
  // The legacy schema predates pageType, not blocks.
  delete page.pageType;
  process.chdir(directory);
  try {
    await (await import('node:fs/promises')).mkdir('data');
    await writeFile('data/db.json', JSON.stringify({ pages: [page] }));
    const link = await jsonStore.createBlock(page.id, 'link');
    const video = await jsonStore.createBlock(page.id, 'youtube');
    assert.ok(link && video);
    await jsonStore.updateBlock(link.id, { title: 'Regression link', url: 'https://example.com' });
    await jsonStore.updateBlock(video.id, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    for (const tab of ['profile', 'content', 'design', 'seo', 'integrations', 'notifications'] as BuilderTab[]) {
      const loaded = (await jsonStore.getPageById(page.id))!;
      assert.equal(loaded.pageType, 'standard');
      const noop = () => {};
      assert.ok(renderToStaticMarkup(<BuilderEditor page={loaded} tab={tab} onTab={noop} onEdit={noop} onBlock={noop} onAdd={noop} onDelete={noop} onDuplicate={noop} onMove={noop} busy={false} />));
    }
    await jsonStore.updatePage(page.id, { title: 'Saved profile', status: 'published' });
    const refreshed = (await jsonStore.getPageById(page.id))!;
    assert.equal(refreshed.title, 'Saved profile');
    assert.equal(refreshed.status, 'published');
    assert.ok(refreshed.blocks.some(block => block.type === 'youtube'));
    const summaries = await jsonStore.listPages();
    assert.equal('blocks' in summaries[0], false);
    assert.equal(summaries[0].clicks, summarizePage(refreshed).clicks);
  } finally {
    process.chdir(root);
    await rm(directory, { recursive: true, force: true });
  }
});

test('MySQL listPages has the same summary contract as JSON (no blocks)', async t => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
  try {
    const page = seedPages()[0];
    const expected = summarizePage(page);
    const pool = mysqlPool();
    t.mock.method(pool, 'query', async () => [[], []]);
    t.mock.method(pool, 'execute', async () => [[{
      id: page.id, name: page.name, slug: page.slug, status: page.status,
      views: page.views, unique_visitors: page.uniqueVisitors, clicks: expected.clicks,
      updated_at: page.updatedAt, page_type: 'standard',
    }], []]);
    assert.deepEqual(await mysqlStore.listPages(), [expected]);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
