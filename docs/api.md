# API Routes

Admin routes require the `smartlink_session` HTTP-only cookie. Every admin
route is scoped to the workspace in that session; a page or block id belonging
to another workspace responds as not found.

## Authentication

- `POST /api/auth/signup` - create an account. A previously invited email joins
  that workspace; any other email gets a new workspace it owns.
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me` - email, role, workspace id, and workspace name.

## Master admin

Requires a master admin session (`MASTER_ADMIN_EMAIL`), which no workspace
session can obtain and which cannot reach any workspace route.

- `GET /api/master/workspaces` - every workspace with owner, status, and
  page/admin/subscriber counts.
- `PATCH /api/master/workspaces` - set a workspace `status` to
  `active` or `disabled`.

## Team

- `GET /api/admin/users` - team for the session's workspace. The owner row is
  returned only to the owner.
- `POST /api/admin/users` - add an admin. Omit `password` to create a pending
  invite instead of a usable account.
- `PATCH /api/admin/users` - reset a password or enable/disable an admin.
- `DELETE /api/admin/users` - cancel a pending invite or remove an admin.

## Pages

- `GET /api/pages`
- `POST /api/pages`
- `GET /api/pages/:id`
- `PUT /api/pages/:id`
- `DELETE /api/pages/:id`
- `POST /api/pages/:id/duplicate`

## Export and import

Workspace-scoped, so a master admin session cannot reach either route.

- `POST /api/pages/export` - body `{ ids: number[] }`. Returns the export JSON
  as a download (`signup888-pages-export-YYYY-MM-DD.json`). Only ids in the
  caller's workspace resolve. Traffic counters are not exported, and every
  `/uploads/...` image the selected pages reference is embedded as base64.
- `POST /api/pages/import` - body `{ file: <export>, keepStatus?: boolean }`,
  or a bare export object. Recreates the pages in the caller's workspace with
  new ids, restores the embedded images into that workspace's media, resets
  views/visitors/clicks to zero, and never overwrites an existing page. Returns
  `{ pages, media, warnings }` with the final slug of each imported page.

## Blocks

- `POST /api/pages/:id/blocks`
- `PUT /api/blocks/:id`
- `POST /api/blocks/:id`
- `DELETE /api/blocks/:id`
- `POST /api/blocks/reorder`

## Analytics

- `GET /api/pages/:id/analytics`
- `POST /api/track/view`
- `POST /api/track/click`

## Notifications

- `GET /api/admin/notifications` - notification setup status, subscriber
  summary, and recent campaign history for the current workspace.
- `POST /api/admin/notifications/send` - sends a browser push campaign and
  stores the campaign delivery counters.
- `POST /api/notifications/campaign-click` - public service-worker endpoint
  used to count notification clicks for a campaign.

## Public Rendering

Published pages render at:

```text
/:slug
```

Draft or disabled pages return the custom 404 page.
