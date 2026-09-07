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
2. Import `docs/schema.sql`.
3. Set `DATABASE_URL` in Hostinger using this format:

```bash
mysql://db_user:db_password@db_host:3306/db_name
```

## Production Environment Variables

```bash
DATABASE_URL=
SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
NEXT_PUBLIC_APP_URL=
COOKIE_SECURE=true
```

For the supplied Hostinger database, use the database and user names exactly as created in hPanel. The database host is shown in **hPanel -> Databases -> Management**. URL-encode special characters in the password (for example, `@` becomes `%40`) before placing it in `DATABASE_URL`.

Use a long random value for `SESSION_SECRET`. Never expose database credentials in frontend code.

## Build And Start

```bash
npm run build
npm run start
```

`npm run start` reads the `PORT` environment variable (falling back to 3000), which matches how Hostinger's Node.js hosting assigns a port to your app — no extra configuration needed.

## Backups

Schedule regular MySQL backups from Hostinger, especially before editing schema or importing data. Keep uploaded media in a separate folder or object storage location and back that up separately from the database.

## Current Storage Note

The app automatically switches its data store based on whether `DATABASE_URL` is set:

- **Not set** (local development): pages, blocks, and analytics are read from and written to `data/db.json`.
- **Set** (production): all reads/writes go through MySQL (`lib/stores/mysqlStore.ts`) against the tables in `docs/schema.sql`. Import that schema before setting `DATABASE_URL` in Hostinger, or the app will fail on first query.

Both implementations share the same interface (`lib/store.ts`), so no route or component code needs to change between environments.
