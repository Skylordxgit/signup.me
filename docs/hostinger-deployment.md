# Hostinger Deployment

This project is built for a Node.js + Next.js app with MySQL.

## Local Development

1. Copy `.env.example` to `.env.local`.
2. Use the demo login locally: `admin@example.com` / `admin123`.
3. Run:

```bash
npm install
npm run dev
```

## Generate An Admin Password Hash

Run this locally and place the result in `ADMIN_PASSWORD_HASH`:

```bash
node -e "const { scryptSync, randomBytes } = require('crypto'); const p = process.argv[1]; const s = randomBytes(16).toString('hex'); console.log(`${s}:${scryptSync(p, s, 64).toString('hex')}`)" "your-strong-password"
```

## MySQL Setup

1. Create a MySQL database in Hostinger.
2. Set either `DATABASE_URL` or the individual database variables in Hostinger:

```bash
mysql://db_user:db_password@db_host:3306/db_name
```

```bash
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
```

The app creates all required tables automatically on its first MySQL request. No SQL import is needed.

## Production Environment Variables

```bash
DATABASE_URL=
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
NEXT_PUBLIC_APP_URL=
COOKIE_SECURE=true
UPLOAD_DIR=/home/USER/smartlink-uploads
MAX_UPLOAD_BYTES=5242880
```

For the supplied Hostinger database, use the database and user names exactly as created in hPanel. The database host is shown in **hPanel -> Databases -> Management**. Individual variables take priority when both options are present. URL-encode special characters in the password (for example, `@` becomes `%40`) only when placing it in `DATABASE_URL`.

Use a long random value for `SESSION_SECRET`. Never expose database credentials in frontend code.

## Build And Start

```bash
npm run build
npm run start
```

`npm run start` reads the `PORT` environment variable (falling back to 3000), which matches how Hostinger's Node.js hosting assigns a port to your app — no extra configuration needed.

## Uploaded Images

Admins upload images through the admin panel; no image URLs are entered by hand.
Files are written to `UPLOAD_DIR` (default `data/uploads`) under a per-type
folder, and only the resulting path — for example
`/uploads/profile/mkq1a2-9f3c.webp` — is stored in the database. Image bytes are
never written to MySQL.

Point `UPLOAD_DIR` at a directory **outside** the deploy folder so uploads are
not wiped by a redeploy, and make sure the Node process can write to it:

```bash
mkdir -p /home/USER/smartlink-uploads
chmod 750 /home/USER/smartlink-uploads
```

Images are resized and converted to WebP in the browser before upload, so
uploads stay small without a native image library on the server. The server
still validates every file independently: it identifies the type from the file's
bytes (not its name or the browser-supplied content type), enforces
`MAX_UPLOAD_BYTES`, generates its own random filename, and requires an
authenticated admin session. Uploaded files are served from `/uploads/*` with
`nosniff` and a sandboxing CSP so an SVG cannot execute script on your domain.

Back this directory up alongside the database — the two are only useful together.

## Backups

Schedule regular MySQL backups from Hostinger, especially before schema changes. Keep uploaded media in a separate folder or object storage location and back that up separately from the database.

## Current Storage Note

The app automatically switches its data store based on whether `DATABASE_URL` is set:

- **Not set** (local development): pages, blocks, and analytics are read from and written to `data/db.json`.
- **Set** (production): all reads/writes go through MySQL (`lib/stores/mysqlStore.ts`). The tables are created automatically on first use.

Both implementations share the same interface (`lib/store.ts`), so no route or component code needs to change between environments.
