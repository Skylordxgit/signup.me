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

## Public Rendering

Published pages render at:

```text
/:slug
```

Draft or disabled pages return the custom 404 page.
