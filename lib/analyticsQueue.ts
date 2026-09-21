import { hasMysqlConfig, mysqlPool } from './mysql';
import { getRedis, isRedisAvailable } from './redis';

export interface QueuedPageView {
  pageId: number;
  visitorHash: string;
  deviceType: string;
  referrer: string;
  country: string | null;
  city: string | null;
  workspaceId: string;
  createdAt?: string;
  isUnique?: boolean;
}

export interface QueuedLinkClick {
  pageId: number;
  blockId: number;
  deviceType: string;
  referrer: string;
  country: string | null;
  city: string | null;
  workspaceId: string;
  createdAt?: string;
}

const viewBuffer: QueuedPageView[] = [];
const clickBuffer: QueuedLinkClick[] = [];
const pageViewIncrements = new Map<number, { views: number; uniqueVisitors: number }>();
const blockClickIncrements = new Map<number, number>();

const FLUSH_INTERVAL_MS = 3000;
const BATCH_SIZE_THRESHOLD = 200;
let isFlushing = false;

/**
 * Enqueues a page view event without blocking the visitor response.
 */
export function enqueuePageView(view: QueuedPageView): void {
  viewBuffer.push(view);
  const current = pageViewIncrements.get(view.pageId) || { views: 0, uniqueVisitors: 0 };
  current.views += 1;
  if (view.isUnique) {
    current.uniqueVisitors += 1;
  }
  pageViewIncrements.set(view.pageId, current);

  // If Redis is active, optionally backup to Redis queue
  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    redis.lpush('queue:page_views', JSON.stringify(view)).catch(() => {});
  }

  if (viewBuffer.length >= BATCH_SIZE_THRESHOLD) {
    void flushAnalytics();
  }
}

/**
 * Enqueues a link click event without blocking the visitor response.
 */
export function enqueueLinkClick(click: QueuedLinkClick): void {
  clickBuffer.push(click);
  blockClickIncrements.set(click.blockId, (blockClickIncrements.get(click.blockId) || 0) + 1);

  const redis = getRedis();
  if (redis && isRedisAvailable()) {
    redis.lpush('queue:link_clicks', JSON.stringify(click)).catch(() => {});
  }

  if (clickBuffer.length >= BATCH_SIZE_THRESHOLD) {
    void flushAnalytics();
  }
}

/**
 * Flushes buffered analytics to MySQL using high-efficiency batch INSERTs.
 * 1,000 events = 1 batch query instead of 1,000 individual queries!
 */
export async function flushAnalytics(): Promise<void> {
  if (isFlushing) return;
  if (viewBuffer.length === 0 && clickBuffer.length === 0 && pageViewIncrements.size === 0 && blockClickIncrements.size === 0) {
    return;
  }

  isFlushing = true;
  const viewsToFlush = viewBuffer.splice(0, viewBuffer.length);
  const clicksToFlush = clickBuffer.splice(0, clickBuffer.length);
  const pageIncrementsToFlush = new Map(pageViewIncrements);
  pageViewIncrements.clear();
  const blockIncrementsToFlush = new Map(blockClickIncrements);
  blockClickIncrements.clear();

  try {
    if (hasMysqlConfig()) {
      const pool = mysqlPool();

      // 1. Bulk insert page views
      if (viewsToFlush.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        for (const item of viewsToFlush) {
          placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
          values.push(
            item.pageId,
            item.visitorHash,
            item.deviceType || 'desktop',
            item.referrer || 'Direct',
            item.country || null,
            item.city || null,
            item.workspaceId || 'default',
            item.createdAt ? new Date(item.createdAt) : new Date()
          );
        }
        await pool.query(
          `INSERT INTO page_views (page_id, visitor_hash, device_type, referrer, country, city, workspace_id, created_at) VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      // 2. Bulk insert link clicks
      if (clicksToFlush.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        for (const item of clicksToFlush) {
          placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
          values.push(
            item.pageId,
            item.blockId,
            item.deviceType || 'desktop',
            item.referrer || 'Direct',
            item.country || null,
            item.city || null,
            item.workspaceId || 'default',
            item.createdAt ? new Date(item.createdAt) : new Date()
          );
        }
        await pool.query(
          `INSERT INTO link_clicks (page_id, block_id, device_type, referrer, country, city, workspace_id, created_at) VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      // 3. Batch increment page views count
      for (const [pageId, inc] of pageIncrementsToFlush.entries()) {
        await pool.query(
          'UPDATE pages SET views = views + ?, unique_visitors = unique_visitors + ? WHERE id = ?',
          [inc.views, inc.uniqueVisitors, pageId]
        );
      }

      // 4. Batch increment block clicks count
      for (const [blockId, count] of blockIncrementsToFlush.entries()) {
        await pool.query(
          'UPDATE page_blocks SET clicks = clicks + ? WHERE id = ?',
          [count, blockId]
        );
      }
    }
  } catch (error) {
    // If MySQL failed (e.g. timeout), requeue items so analytics are never lost
    viewBuffer.unshift(...viewsToFlush);
    clickBuffer.unshift(...clicksToFlush);
    for (const [pageId, inc] of pageIncrementsToFlush.entries()) {
      const current = pageViewIncrements.get(pageId) || { views: 0, uniqueVisitors: 0 };
      current.views += inc.views;
      current.uniqueVisitors += inc.uniqueVisitors;
      pageViewIncrements.set(pageId, current);
    }
    for (const [blockId, count] of blockIncrementsToFlush.entries()) {
      blockClickIncrements.set(blockId, (blockClickIncrements.get(blockId) || 0) + count);
    }
    console.warn('[Analytics Queue] Batch write deferred due to database load:', error instanceof Error ? error.message : error);
  } finally {
    isFlushing = false;
  }
}

// Background flush timer
if (typeof setInterval !== 'undefined') {
  const flushTimer = setInterval(() => {
    void flushAnalytics();
  }, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}
