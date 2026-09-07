# API Routes

Admin routes require the `smartlink_session` HTTP-only cookie.

## Authentication

- `POST /api/auth/login`
- `POST /api/auth/logout`

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
