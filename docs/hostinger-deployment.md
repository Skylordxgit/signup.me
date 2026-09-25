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

## Admin Password

`ADMIN_PASSWORD_HASH` accepts a plain password directly, which is what
Hostinger's environment variable fields are designed for:

```bash
ADMIN_EMAIL=you@your-domain.com
ADMIN_PASSWORD_HASH=YourStrongPassword123
```

The app never stores or compares that plain value. On first use it converts the
password into the same salted scrypt hash format used everywhere else, and only
the hash is written to the `admins` table in MySQL. The salt is derived from the
admin email, so the hash stays identical across restarts and redeploys and your
existing sessions are not invalidated.

If you prefer to supply the hash yourself, generate it locally and paste the
result instead. It is detected automatically and used unchanged:

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
MASTER_ADMIN_EMAIL=
MASTER_ADMIN_PASSWORD_HASH=
NEXT_PUBLIC_APP_URL=
COOKIE_SECURE=true
UPLOAD_DIR=/home/USER/smartlink-uploads
MAX_UPLOAD_BYTES=5242880
CUSTOM_DOMAIN_CNAME_TARGET=domains.example.com
CUSTOM_DOMAIN_SERVER_IP=
MASTER_ADMIN_DOMAIN=admin.example.com
DEFAULT_APP_DOMAIN=app.example.com
```

For the supplied Hostinger database, use the database and user names exactly as created in hPanel. The database host is shown in **hPanel -> Databases -> Management**. Individual variables take priority when both options are present. URL-encode special characters in the password (for example, `@` becomes `%40`) only when placing it in `DATABASE_URL`.

Use a long random value for `SESSION_SECRET`. Never expose database credentials in frontend code.

`ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` configure the platform Master Admin.
Signing in with them opens `/admin/master`, which lists every workspace and can
enter any of them with full access. `MASTER_ADMIN_EMAIL` and
`MASTER_ADMIN_PASSWORD_HASH` are an equivalent fallback pair, used only when the
`ADMIN_*` pair is not set. Leave both pairs blank and master admin login is
disabled entirely.

Either password variable accepts a plain password or a salted scrypt hash. A
plain value is hashed before it is stored in the database, so no plain password
is ever persisted.

A master session does not need a team membership, an invitation, or a permission
grant in any workspace. After choosing a workspace from the control center it
operates there with full owner rights, including disabled workspaces, so a
tenant can always be recovered.

The multi-workspace columns are applied automatically on the first database
connection; see `docs/workspace-team.md` and `docs/schema.sql`.

Custom-domain verification requires one DNS target. Set
`CUSTOM_DOMAIN_CNAME_TARGET` when customers should create a CNAME, or
`CUSTOM_DOMAIN_SERVER_IP` when they should create an A record. CNAME takes
precedence if both are set. The master API returns apex and optional `www`
instructions and verifies the apex with Node's DNS resolver; it never fakes a
successful check. Reserve the control-plane and default hostnames with
`MASTER_ADMIN_DOMAIN` and `DEFAULT_APP_DOMAIN` so tenants cannot claim them.
The application records SSL state for display and infrastructure integration,
but does not request or install certificates.

## Build And Start

```bash
npm install
npm run build
npm run start
```

`npm run start` reads the `PORT` environment variable (falling back to 3000), which matches how Hostinger's Node.js hosting assigns a port to your app — no extra configuration needed.

Hostinger must install dependencies before starting `server.cjs`. The production
build toolchain is intentionally listed under `dependencies`, and `postinstall`
creates `dist/standalone/server.js` automatically. If Hostinger exposes separate
commands, use `npm install` as the install command, `npm run build` as the build
command, and `server.cjs` as the application startup file. Do not upload
`node_modules`; Hostinger recreates it from `package-lock.json`.

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

## GeoIP City Database

Analytics location is resolved on the server from the visitor IP. The app does
not infer cities from browser time zones and does not send visitor IPs to a
third-party API.

Production needs a licensed MaxMind GeoLite2 City database on disk:

```env
GEOIP_DB_PATH=/home/USER/geoip/GeoLite2-City.mmdb
```

Download `GeoLite2-City.mmdb` from MaxMind using your account/license key, place
it outside the Git deploy folder, and make it readable by the Node process. Do
not commit the `.mmdb` file. Update it on a schedule, for example monthly, using
MaxMind's documented download/update process.

Master Admin shows `GeoIP City DB: Loaded / Missing / Error`. If it is Missing
or Error, public-IP visitors can only resolve from trusted CDN country headers
when present; region and city stay Unknown. Localhost and private proxy IPs are
expected to resolve as Unknown.

Make sure the app receives the real visitor IP from the trusted proxy path:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

If Cloudflare is in front, preserve `CF-Connecting-IP` only through the trusted
Cloudflare/proxy path. Do not expose the app directly while trusting arbitrary
client-supplied IP headers.
# Mobile Notifications and Subscriber Details

iPhone and iPad web push requires iOS/iPadOS 16.4+ and installation as a
Home Screen web app. Visitors open the public /slug page in Safari, use Share
> Add to Home Screen (keep Open as Web App enabled when offered), then launch
the icon and allow notifications. Each public page now links a standalone
manifest whose start URL and identity are that page's /slug.

Android uses feature detection, not an OS-version allowlist. Updated browsers
with Push API support can subscribe. Unsupported browsers, embedded webviews,
insecure pages, denied permissions, and older iOS versions show relevant guidance.
No web application can guarantee push on every Android version or device.

Notifications in the admin panel lists the latest 100 subscriptions, device,
browser, IP, approximate city/country, client time zone, and subscription date.
Device/browser/time zone are reported or inferred, not verified identity.
Old records cannot recover IP/location retroactively. No GPS is requested and
no visitor IP is sent to a third-party geolocation API.

IP and location are optional. Ask Hostinger which request headers their proxy
overwrites with the connecting visitor's IP and approximate country/city.
Only after confirmation, set these environment variables to the header names:

```env
SUBSCRIBER_IP_HEADER=
SUBSCRIBER_COUNTRY_HEADER=
SUBSCRIBER_CITY_HEADER=
```

The IP header must contain one IPv4/IPv6 address, not an X-Forwarded-For chain.
Never configure headers that the proxy leaves under the visitor's control.
Leave unsupported headers blank; the table displays Not recorded. A time zone
does not substitute for location. VPNs and proxies can obscure the actual address.
Subscriber data is returned only through the authenticated admin API with
no-store caching. The visitor prompt discloses collection before subscribing.

MySQL automatically adds the nullable client_details JSON column plus inactive
subscriber tracking columns to the existing push_subscriptions table on first
use; the database user needs ALTER privileges.
No manual SQL import is needed. Local JSON storage also supports these fields.
