import type { AdminSession } from './auth';
import { blockPageId, getPageById } from './store';
import type { SmartPage } from './types';

/** Loads a page only when it belongs to the caller's workspace.
 *
 *  A page in another workspace reports as missing rather than forbidden, so
 *  the API never confirms that an id exists elsewhere. Every workspace-scoped
 *  route resolves its page through here, which is why a page id coming from
 *  the client can never reach data outside the session's workspace. */
export async function pageForSession(session: AdminSession, id: number): Promise<SmartPage> {
  if (!Number.isFinite(id)) throw new Error('Page not found');
  const page = await getPageById(id);
  if (!page || page.workspaceId !== session.workspaceId) throw new Error('Page not found');
  return page;
}

/** Same check for a block: the block's own page must be in the workspace. */
export async function assertBlockInWorkspace(session: AdminSession, id: number) {
  const pageId = Number.isFinite(id) ? await blockPageId(id) : null;
  if (pageId === null) throw new Error('Block not found');
  const page = await getPageById(pageId);
  if (!page || page.workspaceId !== session.workspaceId) throw new Error('Block not found');
}
