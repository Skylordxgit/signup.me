# AI Handoff Guide

Read this file before editing this repository. Keep it updated after every
completed task so the next AI or developer can understand the current system,
recent work, and safe workflow.

## Repository

- GitHub: `https://github.com/Skylordxgit/signup.me.git`
- Production branch: `main`
- Local app folder used during recent work:
  `C:\Users\USER\Documents\ChatGPT\Signup888.shop`
- Framework: React + TypeScript + vinext/Next-style app routes
- Database: MySQL in production, JSON fallback in local development

## Current Product Shape

Signup888 is a link/profile page builder with:

- Public mobile-friendly profile pages at `/{slug}`
- Full-screen responsive admin dashboard at `/admin`
- Page builder with editor controls and a 9:16 phone preview only inside the
  builder
- Media uploads saved to database or local fallback
- Browser push notifications
- Push campaign history with delivery and notification-click counters
- Workspace/team accounts
- Multi-workspace signup
- Master admin dashboard
- Master-controlled public signup permission

Important rule: the admin dashboard is a desktop web app. Do not make the whole
admin look like a phone app. The phone frame belongs only in the page builder
preview.

## Latest Known Main Updates

As of the latest handoff, `main` includes:

- `d9b5ceb` - Keeps builder slug synced while editing
- `59de816` - Adds multi-workspace signup, workspace isolation, and master admin
- `f7d045f` - Keeps workspace constants client-safe so server/MySQL modules do
  not leak into the browser build

Other recent features already in `main`:

- Admin/team role system
- Admins can add/manage other admins
- Admins do not see the workspace owner in Team
- Team password minimum is 8 characters
- Notification prompt is page-customizable
- Notification prompt appears immediately when enabled
- Successful notification allow closes quietly
- Failed notification subscribe shows retry/error
- Sent notification campaigns are saved per workspace and shown in the
  Notifications screen with sent/views, failed/expired, and click counters.
- Social Icon Row adds Facebook, Instagram, WhatsApp, Telegram together
- YouTube/video blocks render embedded where possible
- Media persistence fixes for logo, cover, profile, block images, and media
  library
- Missing public slug page offers visitors a path to create their own page

## Key Files

- Admin shell: `components/AdminDashboard.tsx`
- Admin views: `components/admin/DashboardViews.tsx`
- Builder UI: `components/admin/BuilderEditor.tsx`
- Team UI: `components/admin/UsersView.tsx`
- Master admin UI: `components/MasterDashboard.tsx`
- Public renderer: `components/PageRenderer.tsx`
- Notification opt-in: `components/NotificationOptIn.tsx`
- Auth/session logic: `lib/auth.ts`
- Signup logic: `lib/signup.ts`
- Workspace logic: `lib/workspaces.ts`
- Client-safe workspace constants: `lib/workspaceConstants.ts`
- Global branding store: `lib/branding.ts`
- Client-safe branding defaults/types: `lib/brandingConstants.ts`
- Shared auth brand row and per-tab branding cache: `components/AuthBranding.tsx`
- Page export/import format and logic: `lib/pageTransfer.ts`
- Workspace users/team: `lib/workspaceUsers.ts`
- Workspace access guards: `lib/workspaceAccess.ts`
- Upload/media persistence: `lib/uploads.ts`
- Shared types: `lib/types.ts`
- Shared utilities/block defaults: `lib/utils.ts`
- MySQL schema/migrations: `lib/mysql.ts`
- Store selector: `lib/store.ts`
- JSON fallback store: `lib/stores/jsonStore.ts`
- MySQL store: `lib/stores/mysqlStore.ts`
- Schema docs: `docs/schema.sql`
- Workspace/team docs: `docs/workspace-team.md`
- Deployment docs: `docs/hostinger-deployment.md`
- API docs: `docs/api.md`

## Multi-Workspace Rules

- Public signup is email + password only.
- No OTP, no email verification, no approval flow.
- Master Admin controls whether public signup is open. When disabled, the
  Sign Up entry point is hidden and `/api/auth/signup` rejects direct requests.
- Password must be 8-128 characters.
- A new signup with no invite gets a new workspace and becomes owner of that
  workspace.
- An email invited to an existing workspace joins that invited workspace when it
  signs up.
- A new uninvited user must never be added to the existing/default workspace.
- Normal owners/admins can only access their own workspace.
- Workspace isolation must be enforced on the server, not trusted from client
  input.
- Master admin is separate from workspace owners/admins.
- Master admin uses `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`, falling back to
  `MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD_HASH`.
- The master password variable accepts a plain password or a salted scrypt
  hash. Plain values are hashed in `lib/master.ts` before storage, using a salt
  derived from the email so the hash is stable across restarts. A plain password
  is never written to the database.
- A master session enters any workspace with full owner rights and every
  permission. It must never require a team record, invitation, or permission
  grant, and must not be blocked by a disabled workspace.
- A master session with no workspace selected falls back to the default
  workspace so the admin shell always opens.
- Workspace sessions must not access master APIs, and master-only global
  controls must stay unavailable to workspace sessions.

## Team Rules

- The configured `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` account is the platform
  master and the owner of the default/main workspace.
- Owners and admins can invite/add admins.
- Admins can manage other admins.
- Admins must not see the workspace owner in Team.
- Pending invites may have no password hash until signup.
- Resetting a password or disabling an admin must invalidate old sessions by
  bumping session version.

## Push Notification Rules

- Live sending requires stable VAPID keys in hosting:
  - `WEB_PUSH_PUBLIC_KEY`
  - `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`
  - `WEB_PUSH_PRIVATE_KEY`
- Both public key variables must have the same value.
- Do not commit private keys.
- `.env.web-push.local` is local/ignored and must remain uncommitted.
- Public prompt must be customizable per page.
- If visitor allows notifications, close the popup quietly.
- If subscribe/save fails, show retry and error message.
- Campaign "views" are represented by successful browser push delivery
  accepts (`sent`). The service worker tracks real notification clicks through
  `/api/notifications/campaign-click`.
- Do not add extra unnecessary footer/data notices unless the user asks.

## Media Rules

- Uploaded logo, cover, profile, block images, custom icons, and media library
  files must persist after refresh.
- MySQL production media is database-backed.
- JSON/local fallback uses local `data` files.
- Media listing must be workspace-scoped.
- Public upload URLs may remain unscoped so existing pages keep serving images.
- Never expose media from one workspace inside another workspace admin.

## Public Page Rules

- Public pages must remain mobile-friendly.
- Missing public slug should be friendly and creative, offering the visitor a
  way to log in/sign up and build that slug.
- YouTube embeds can still be blocked by YouTube for age restriction or disabled
  embedding. Do not promise that code can bypass YouTube platform restrictions.

## Admin UI Rules

- Admin dashboard must be full-screen responsive.
- Desktop: sidebar, header, main workspace.
- Builder desktop: sidebar, editor controls, phone preview.
- Tablet/mobile: no horizontal overflow; sidebar drawer/collapsible behavior.
- Use existing admin CSS patterns and lucide icons.
- Keep UI clear and professional.
- Do not put the admin content into a narrow phone-sized container.

### Admin Design System (added 2026-09-15)

`components/admin/admin.css` is now only an entry point that imports five
layers. Add new rules to the correct layer instead of appending to one file:

1. `tokens.css` - spacing (`--sp-*`), radius, type scale (`--text-*`), colour
   (`--c-*`), elevation (`--shadow-*`), control sizing (`--control-h`,
   `--icon-btn`), layout (`--adm-sidebar`, `--adm-gutter`, `--adm-preview-w`).
2. `base.css` - element defaults, typography hierarchy, every form control,
   the single focus ring, the image uploader.
3. `components.css` - buttons, cards, badges, tables, empty/loading/error
   states, dialogs, drawers, progress.
4. `layout.css` - shell, sidebar, header, main, builder workspace, responsive.
5. `screens.css` - notifications, campaigns, subscribers, master center.

Rules that matter:

- Never hard-code pixel spacing, colour or font size in a screen. Use tokens.
- Every button is `.admButton` (+ `admPrimary` / `admOutline` / `admGhost` /
  `admDestructive` / `admSmall`) or `.admIconButton`. Icon-only buttons must
  pass a `label`, which becomes both the tooltip and the accessible name.
- Reusable React primitives live in `components/admin/AdminUI.tsx`: `Button`,
  `IconButton`, `Field`, `Dialog`, `StatusBadge`, `EmptyState`, `LoadingState`,
  `Skeleton`, `SectionHeading`, `PageHeader`, `SectionCard`. Compose these
  rather than writing raw `<button className="admButton">` markup.
- The phone frame is scoped to `.admPreviewPane` inside the builder with a fixed 9:16 aspect ratio (`width: 100%; max-width: 380px; aspect-ratio: 9 / 16;`), realistic dark titanium chassis bezel, centered Dynamic Island, and internal smooth scrolling viewport (`.phoneScreen`). It maintains the exact same dimensions, radius, and ratio across all builder tabs, content lengths, and responsive breakpoints.
- The admin phone preview and public mobile pages use the identical shared renderer (`PageRenderer.tsx`) without drift; the hardware phone frame only wraps the admin preview.
- Inline `style={{...}}` is not used for layout in admin screens.

### Admin UI and Browser Tests

`tests/admin-ui-audit.mjs` and `tests/admin-browser.mjs` drive real browser instances over every admin screen and the public mobile page, asserting no horizontal overflow, 9:16 phone ratio stability, no element outside the viewport, no sidebar/content overlap, modals contained on mobile, and zero console errors:

```bash
npm run build
node tests/admin-browser.mjs
node tests/admin-ui-audit.mjs
```

## How To Work

1. Check current repo state:

   ```bash
   git status --short --branch
   ```

2. Pull latest main before starting:

   ```bash
   git -c http.sslBackend=openssl pull origin main
   ```

3. Search first, usually with `rg`:

   ```bash
   rg -n "thing to change" app components lib tests docs
   ```

4. Read nearby files before editing. Do not guess how the app works.

5. Make small focused edits that follow existing patterns.

6. Preserve unrelated user or AI changes. Do not reset, checkout, or revert
   files unless the user explicitly asks.

7. When changing behavior, check both:

   - frontend UI validation/copy
   - backend API validation/security

8. For workspace behavior, check both:

   - MySQL store/schema
   - JSON fallback store/tests

9. For client components, do not import server modules even for types if the
   build starts pulling server code into the browser bundle. Prefer local UI
   payload types or a tiny client-safe shared type/constant file.

## Verification Before Commit

Always run all four checks before committing:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

Expected current test count after the push campaign history fix: 50 passing tests.

If build passes but prints browser compatibility warnings about server modules
such as `fs/promises`, `path`, `crypto`, `mysql2`, or `lib/workspaces.ts`, trace
client imports. A previous issue was caused by a client-reachable default/theme
module importing `DEFAULT_WORKSPACE_ID` from the server workspace module. It was
fixed by moving the constant to `lib/workspaceConstants.ts`.

## Git Commit And Push

Use focused staging. Do not blindly stage secrets, generated output, or unrelated
files.

```bash
git status --short
git add <specific changed files>
git commit -m "Short clear message"
git -c http.sslBackend=openssl push origin main
git status --short --branch
```

Push destination for completed work:

```bash
origin main
```

If another AI pushes to a feature branch, fetch it, inspect it, verify it, then
merge it into `main` only when appropriate:

```bash
git -c http.sslBackend=openssl fetch origin main <branch-name>
git diff --stat main..origin/<branch-name>
git diff --name-status main..origin/<branch-name>
git merge --ff-only origin/<branch-name>
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
git -c http.sslBackend=openssl push origin main
```

If fast-forward is not possible, stop and inspect conflicts carefully. Do not
force-push `main`.

## Mistakes Already Found And Solved

- A client build warning appeared because server-only workspace/MySQL modules
  were reachable from browser code. Fix: move shared constants/types used by
  client code into client-safe files, and avoid importing API route/server module
  types into `"use client"` components.
- PowerShell treats paths with `[id]` as wildcard patterns. Use `-LiteralPath`
  for app route files such as `app\api\pages\[id]\route.ts`.
- Git/network on this machine may need:
  `git -c http.sslBackend=openssl ...`
- Git writes to `.git` can require approval/escalation in Codex.
- Earlier staging was blocked once due workspace credits. When that happens,
  do not bypass it; explain the blocker and keep local changes safe.
- Do not expose or commit VAPID private keys. Generated keys were stored in an
  ignored local env file.
- MySQL migration paths are type-checked and implemented, but should still be
  smoke-tested against a copy of production when schema changes are large.
- YouTube age-restricted videos cannot be fixed by code; YouTube itself blocks
  embedded playback.
- 2026-09-25: Builder save/summary regression. `GET /api/pages` returns
  `PageSummary[]` (summaries never carry blocks). A block-mutation refresh
  passed those summaries back through `summarizePage()`, which does
  `page.blocks.reduce(...)`, throwing `Cannot read properties of undefined
  (reading 'reduce')` even though the block write had succeeded. Fix:
  refresh paths consume `PageSummary[]` directly via
  `adminApi<PageSummary[]>("/api/pages")`; `PageSummary.blocks` was removed
  from `lib/types.ts` and `summarizePage()` now has an explicit
  `: PageSummary` return type so the compiler forbids mixing the two.
  `components/admin/usePageEditor.ts` save() separates Phase 1 persistence
  errors ("Page changes could not be saved.") from Phase 2 page-list sync
  errors ("Page was saved, but the page list could not refresh.").
  `app/admin/(dashboard)/pages/[id]/edit/page.tsx` `mutateBlocks()` splits
  mutation failure vs post-mutation reload/list-refresh failure the same way.
  Publish (status select) saves immediately and reverts the optimistic
  status if persistence fails, so "Published" is only shown after confirmed
  save. Regression test: `tests/builderSummaryRegression.test.tsx`.
  Never call `summarizePage()` on a `PageSummary`; never add
  `(page.blocks || [])` fallbacks to `summarizePage()` — keep it strict.

## Required Handoff Update After Every Task

After finishing any task, update this file if you changed:

- auth/session/workspace behavior
- database schema or migrations
- admin/team/master admin behavior
- public page behavior
- notification behavior
- upload/media behavior
- build/test workflow
- deployment environment variables
- known warnings, pitfalls, or fixes
- latest important commits

At minimum, add a short note under this section:

### Last Task Notes

- 2026-09-26: Centered all public notification popups, including optional
  prompts with saved corner positions, and removed their Not now button.
  This extends the prior required-only centering fix. Existing optional Escape
  dismissal and subscription behavior remain intact.

- 2026-09-25: Required notification popups now center in the viewport on desktop
  and mobile, overriding saved corner placement. Uses auto margins without
  transforms so shake animations keep their center; tall content scrolls within
  viewport margins. Optional notification widgets retain their saved position.

- 2026-09-25: Fixed production GeoIP configuration in Hostinger. The user
  uploaded the verified GeoLite2 City database into the site's private `geoip/`
  directory, alongside `public_html/`. Hostinger's FTP directory field confirmed
  the site root; GEOIP_DB_PATH now points to
  `/home/u333297810/domains/signup888.shop/geoip/GeoLite2-City.mmdb`.
  Applied the environment change and verified the completed deployment and live
  Master Admin health indicator: `GEOIP CITY DB Loaded updated 25 Sept 2026`.
  The database remains outside Git and public_html; no code change was needed.

- 2026-09-25: Fixed login remaining stuck after network/proxy failures. Added
  client-safe login transport with a 30-second timeout, confirmed JSON success,
  actionable errors, and form loading-state recovery plus duplicate submission
  protection. Malformed login request bodies now return JSON validation errors.
  Added regression coverage for login transport failures, redirects, timeout,
  and malformed requests. Successful master/workspace destinations are preserved.
  Validation: 134 tests passed (2 skipped), TypeScript and production build passed.
  Full lint remains blocked by existing issues outside the changed login files.


- 2026-09-21: Added visual Location Graph (`LocationChart`) and Date Range filtering to Workspace Overview Dashboard and Analytics.
  - Built `LocationChart` component rendering interactive comparative horizontal visual bars for Views vs Clicks per geographic location with CTR percentage badges.
  - Integrated `LocationChart` into Workspace Overview (`DashboardHome`) and Analytics screen (`AnalyticsView`).
  - Added dynamic date range filtering (7 days, 14 days, 30 days, 90 days, all time) across traffic charts, location graphs, and summary metrics.
  - Added geographic tracking (country, city, readable location) on visitor views and link clicks with auto-resolution of ISO country codes via `Intl.DisplayNames`.
  - Added comprehensive test coverage (71 passing tests), 0 lint errors, 0 warnings, and verified production build.
- 2026-09-21: Added "Create workspace" functionality to the Master Admin control center with complete multi-tenant data isolation.
  - Implemented `POST /api/master/workspaces` supporting custom workspace name and optional owner email with immediate password or 7-day single-use invite link.
  - Added "Create workspace" buttons to Master Admin Workspaces view, Overview hero/recent section, and EmptyState.
  - Integrated `Create new workspace` modal dialog conforming to the Admin design system with live validation and error handling.
  - Verified strict multi-tenant workspace isolation across all entities: pages, blocks, media uploads, push subscriptions, notification campaigns, team members, and settings.
  - Added regression test `master admin can create multiple workspaces and their data never mixes` to `tests/workspaceIsolation.test.ts`.
  - All 70 tests pass, linting and TypeScript compile with 0 errors and 0 warnings, and production build succeeds.
- 2026-09-15: Audited, cleaned, optimized, and debugged the entire project.
  - Repaired `tests/admin-browser.mjs` auth setup so the isolated test server
    provisions the `qa@example.com` workspace test account, allowing all 43
    browser workflow assertions to pass 100%.
  - Cleaned 1,760 accumulated dummy 0-byte test files from `data/uploads/` while
    preserving the 8 category directories (`profile`, `banner`, `block`, `logo`,
    `background`, `icon`, `og`, `favicon`), resulting in a 50% test suite
    execution speedup (1.6s vs 3.2s).
  - Cleared temporary test screenshots from `.next/admin-qa` and
    `.next/admin-ui-audit`.
  - Audited TypeScript compiler with `--noUnusedLocals` and
    `--noUnusedParameters` (0 errors, 0 warnings).
  - Audited ESLint across the codebase (0 errors, 0 warnings).
  - Verified dev server startup on `npm run dev` (HTTP 200).
  - Verified production build and standalone server execution on `npm run build`
    (HTTP 200).
  - Verified full test suite on `npm test` (58/58 passing).
  - All core source files, database migrations, auth logic, configs, themes, and
    APIs remain intact and fully operational.
- 2026-09-15: Audited and repaired the complete admin panel UI/UX. No backend,
  route, API, auth or data behaviour was changed; this was visual/structural
  only.
  - Replaced the single 786-line `admin.css` with a five-layer design system
    (`tokens`/`base`/`components`/`layout`/`screens`). Spacing, radius, type,
    colour, elevation and control heights are now tokens, so inputs, selects
    and buttons all share one 38px height and one focus ring.
  - Extended `AdminUI.tsx` with `Button`, `LoadingState`, `Skeleton`,
    `PageHeader` and `SectionCard`, gave `Dialog` a sticky header plus a
    scrolling `.admDialogBody`, gave `Field` hint/error support, and gave
    `EmptyState` an icon/description/action shape. Screens now compose these.
  - Sidebar grouped into Overview / Content / Engagement / Workspace with
    aligned icons, real active states, a page-count pill, and an icon rail that
    auto-collapses at <=1100px before becoming a drawer at <=820px.
  - Header gained a breadcrumb, a consistent search field, save status,
    Preview/Save, and an account menu.
  - Builder: editor gets the remaining width while the preview is pinned at a
    stable 390px 9:16 frame that scrolls internally and never widens the shell.
  - Fixed a real bug: the header account dropdown laid out its panel while the
    `<details>` was closed, rendering ~248px off-screen and causing horizontal
    overflow on every screen at 390px. Panel is now `display:none` until open.
  - Fixed the notifications sub-nav overflowing at 390px by fitting the three
    tabs into a grid instead of hiding them behind a horizontal scroll.
  - Removed inline `style={{...}}` layout from `DashboardViews.tsx` (campaign
    table column widths, send-result banner, subscriber search).
  - Master control center restyled onto the same light, restrained system, so
    it no longer looks like a separate dark product.
  - Verification: `npm run lint`, `tsc --noEmit`, `npm test` (58 passing),
    `npm run build`, plus the new `tests/admin-ui-audit.mjs` browser audit
    covering 76 screen states with zero failures.
- 2026-09-13: Rebuilt `/admin/master` as a responsive control center instead
  of a long stacked settings page. Desktop now uses a dark persistent sidebar
  with Overview, Workspaces, All users, Global branding, and Signup access;
  mobile uses an accessible drawer. Added an overview hero, clearer metrics,
  workspace/user cards, a live branding preview, and a focused signup-status
  panel. Also removed corrupted template strings left by an earlier scripted
  edit. Verification passed: lint, TypeScript, 57 tests, and production build.
- 2026-09-13: Refactored Admin and Workspace architecture to enforce exactly two admin types: Master Admin (global) and Workspace Admin/Owner (scoped). Removed 'admin' role in favor of 'owner'. Direct signups create isolated workspaces without default inheritance. Master Admins now have universal global access across the platform without requiring an explicit workspace_id.


- 2026-09-09: Added notification campaign history. `/api/admin/notifications`
  now returns recent campaigns with per-workspace scoping. Sending a push
  creates a `notification_campaigns` row before delivery, attaches the campaign
  id to the push payload, then updates attempted/sent/failed/expired counters
  after delivery. `public/push-worker.js` posts notification clicks to
  `/api/notifications/campaign-click`, which increments that campaign's click
  count and never blocks opening the destination link. The Notifications screen
  now shows a Campaigns section with campaign count, notification views
  (`sent`), notification clicks, CTR, audience, delivery, destination, and sent
  time. JSON fallback and MySQL production storage both support the history.
  Regression coverage: `tests/workspaces.test.ts` and `tests/push.test.ts`.
  All four checks passed (50 tests).
- 2026-09-09: Added a Master Admin "Allow public signup" permission inside the
  Branding panel. The setting is stored with global branding as
  `signupEnabled` and defaults to `true` so existing deployments keep allowing
  signup until the master admin turns it off. `/admin/login` and `/admin/signup`
  now read the setting server-side before rendering, so when it is off the Sign
  Up button/form are not painted. `/api/auth/signup` also checks the same
  setting and returns 403 for direct signup attempts while disabled. The login
  and signup interactive form logic was split into client components
  (`components/LoginForm.tsx`, `components/SignupForm.tsx`) so the pages can
  perform this server-side permission read first. Regression coverage:
  `tests/authUi.test.tsx` plus updated branding tests. All checks passed
  (49 tests).
- 2026-09-09: Reproduced the broken Sign Up click on the live Hostinger site.
  The console reported `[vinext] RSC prefetch setup error: TypeError: d is not
  a function` and `TypeError: e is not a function` in the Link bundle. Clicking
  stayed on login, while navigating directly to `/admin/signup` rendered the
  form. Both Sign Up entry points and the return Login link now use native
  anchors so auth navigation does not depend on that failing RSC client path.
  This supersedes the earlier prefetch recommendation for these auth links.
  Signup submission now handles network errors, HTML/proxy responses, and a
  30-second timeout, restores the submit button on failure, and only redirects
  after a JSON `{ ok: true }` response. No automatic signup retries: a lost
  response can mean the account was already created. Workspace and invitation
  rules remain server-enforced. Regression coverage: `tests/signupClient.test.ts`.
  Verified against the production build locally: native Sign Up navigation,
  account creation with a valid session and empty isolated workspace, pending
  invite signup joining the existing workspace, duplicate-account errors, and
  logging in again with the saved account. All four checks passed (48 tests).
  Live MySQL account creation was not exercised; HTTP account tests used an
  isolated local JSON store, with no writes to production accounts.
- 2026-09-09: Added this handoff guide so future AI agents know the current
  architecture, workflow, push process, and known pitfalls. Future agents should
  keep this section current after completing work.
- 2026-09-09: Added global branding storage/API for Master Admin branding
  controls, removed Apple login from the auth options, made the signup link a
  stronger button-style link, and wired auth/admin metadata to saved branding.
  Google login is still a placeholder until OAuth client credentials and callback
  handling are added.
- 2026-09-09: Fixed slow `/admin/login` -> `/admin/signup` navigation. Measured
  cause: `getBranding()` had no cache, and the root layout awaits it in
  `generateMetadata()`, so every route render - including every client-side
  navigation and every Link prefetch - waited on a branding storage read. With a
  branding store taking 1.5s, each navigation to `/admin/signup` measured
  ~1.51s; after the fix the first render pays one read and every later
  navigation is ~15ms (prefetch ~8ms). Changes:
  - `lib/branding.ts` now caches branding for 30s in-process, times a read out
    at 1.5s, never throws, and parks the fallback for 5s after a failed read so
    a broken database costs one slow read instead of one per navigation.
    `saveBranding()` refreshes the cache immediately and `invalidateBranding()`
    drops it, so master admin branding changes still appear right away.
  - `lib/brandingConstants.ts` is a new client-safe module holding
    `BrandingSettings` and `defaultBranding`, following the existing
    `lib/workspaceConstants.ts` pattern so client code never imports the server
    branding module.
  - `components/AuthBranding.tsx` is the shared auth brand row. It caches
    branding per tab, so login -> signup reuses the already-fetched value with no
    second request and no fallback flash. `AdminDashboard` uses the same cached
    fetch, removing the third copy of that logic.
  - The Sign Up links use `<Link ... prefetch>` so the payload is fetched before
    the click. The Login link on signup does the same.
  - Auth pages still render the fallback brand immediately and never wait on
    branding.
  - Caveat: the branding cache is per process, so in a multi-process deployment
    a master admin branding save can take up to 30s to appear on workers that
    did not handle the save.
  - Tests: `tests/branding.test.ts` covers the fallback, the save-then-read
    path, and that cached reads do not touch storage. Test count is now 37.
- 2026-09-09: Added Export Pages / Import Pages to the admin Pages screen so a
  page can be moved to another workspace or a fresh server without rebuilding
  it. Files:
  - `lib/pageTransfer.ts` holds the versioned format
    (`kind: "signup888.pages.export"`, `version: 1`), the export builder, the
    envelope validator, and the importer.
  - `app/api/pages/export/route.ts` (`POST`, body `{ ids }`) returns the JSON
    with a `Content-Disposition` filename of
    `signup888-pages-export-YYYY-MM-DD.json`.
  - `app/api/pages/import/route.ts` (`POST`, body `{ file, keepStatus }`)
    recreates the pages and returns `{ pages, media, warnings }`.
  - UI: `PagesTable` gained an optional `onExport` prop rendering "Export
    selected" in the existing bulk bar, and `AdminDashboard` gained an "Import
    pages" button beside Create page plus an `ImportPagesDialog`.
  Behaviour worth knowing:
  - Media is embedded as base64 because a `/uploads/...` path is meaningless on
    another workspace or server. Every stored upload referenced ANYWHERE in the
    page data is collected by a recursive walk, not a fixed field list, so new
    image-carrying fields are covered automatically. Remote https images stay
    URLs.
  - On import, embedded files go through the same checks as a direct upload
    (`sniffImage`, `isSafeSvg`, category rules, `maxUploadBytes`) and are saved
    with `storeUpload` into the session workspace, so nothing from the file
    reaches a filesystem path. A reference whose file could not be restored is
    cleared, not left broken, and reported in `warnings`.
  - Slugs are globally unique in both stores, so the importer retries
    `slug`, `slug-copy`, `slug-copy-2`, ... by catching "Slug already exists"
    from `createPage` rather than pre-checking. That keeps it backend-agnostic.
  - Imports default to draft; the dialog has a "Keep the original published
    status" checkbox. Views, unique visitors, and block clicks always reset.
  - The workspace always comes from the session; `workspaceId` in the file is
    ignored. In the unified admin model, master admin sessions are anchored to
    the default workspace for workspace APIs.
  - Tests: `tests/pageTransfer.test.ts` covers the full round trip across two
    workspaces, repeat imports taking the next free slug, keepStatus, and a
    hostile export (path traversal, bad category, non-image payload) being
    rejected without failing the whole import. Test count is now 43.
- 2026-09-12: Added the first version of animated buttons as a Page Designs
  toggle. `ThemeSettings.buttonAnimation` still exists as a backward-compatible
  fallback, but the visible editor control was later replaced by per-button
  effects.
  - Theme changes now preserve `buttonAnimation` alongside cover/profile/share
    choices.
  - Added `tests/PageRenderer.test.tsx` coverage proving the class appears only
    when the page design toggle is on.
  - While verifying, fixed two pre-existing blockers: `app/admin/signup/page.tsx`
    now narrows the signup settings response before reading `enabled`, and the
    JSON fallback store now assigns block IDs with `nextId` instead of
    `Date.now()` so rapid import/duplicate operations cannot collide.
  - `package-lock.json` was repaired by `npm install` because `npm ci` reported
    the lockfile was out of sync around optional `@emnapi/*` packages.
  - Verification passed: `npm run lint`, `./node_modules/.bin/tsc --noEmit
    --incremental false`, `npm test` (49 passing), and `npm run build`.
- 2026-09-12: Changed button animations from a visible page-wide design toggle
  to per-button effects. Each link/button block now has `Button effect` in its
  content editor, stored in `block.settings.buttonEffect`; supported effects are
  `shine`, `border-glow`, `neon-border`, `pulse`, `breathe`, `lift`,
  `slide-light`, `aurora`, `double-ring`, and `spotlight`, plus `none`.
  Existing pages with `theme.buttonAnimation` still fall back to the `shine`
  effect unless an individual button explicitly sets `none`. Custom button
  colors also update `--button-bg` so the effect uses that button's own color.
  Verification passed: `npm run lint`, `./node_modules/.bin/tsc --noEmit
  --incremental false`, `npm test` (50 passing), and `npm run build`.
- 2026-09-12: Merged master admin access into the normal `/admin` shell.
  Master login now redirects to `/admin`, `/admin/master` redirects to `/admin`,
  and `resolveAdminSession()` resolves a configured master session as the
  default workspace owner with `isMaster: true`. `/api/auth/me` exposes that flag
  to the client. Normal workspace users still see the same Settings page; master
  users additionally see `Master controls` inside Settings with Signup access
  and global Branding panels wired to the existing `/api/master/signup` and
  `/api/master/branding` APIs. Verification passed: `npm run lint`,
  `./node_modules/.bin/tsc --noEmit --incremental false`, `npm test` (49
  passing), and `npm run build`.
- 2026-09-21: Built complete Custom Domain Management system in Master Admin.
  - Added `custom_domains` and `domain_audit_events` tables in MySQL runtime
    migrations and `docs/schema.sql` with JSON fallback persistence in `data/domains.json`.
  - Added domain normalization: auto-strips `https://`, `www.`, ports, paths,
    and trailing slashes (`https://www.brand-a.com/` -> `brand-a.com`).
  - Added strict domain validation rejecting localhost, IP addresses, internal suffixes,
    and reserved platform domains (`MASTER_ADMIN_DOMAIN`, `DEFAULT_APP_DOMAIN`).
  - Added DNS verification using `node:dns/promises` checking CNAME (`CUSTOM_DOMAIN_CNAME_TARGET`)
    or A (`CUSTOM_DOMAIN_SERVER_IP`) records with optional `www` configuration.
  - Added Master Admin Domains panel with full CRUD, DNS verification trigger, assignment,
    unassignment, and enable/disable toggles.
  - Integrated Assign Domain into workspace creation dialog and workspace edit dialog.
  - Implemented hostname-based tenant resolution in `lib/domainRouting.ts`: incoming request `Host`
    resolves mapped workspace and serves custom-domain root primary page and pages without leaking other tenants.
  - Scoped public telemetry (view tracking, click tracking, push subscriptions, manifest) to the host-resolved workspace.
  - Added test coverage in `tests/domains.test.ts`, `tests/domainRouting.test.ts`, and `tests/MasterDashboard.test.tsx` (83 passing tests).
  - Verified: `npm run lint`, `npx tsc --noEmit --incremental false`, `npm test` (83 tests), and `npm run build`.
- 2026-09-25: Subscriber location showed "Unknown" city/region because the
  GeoLite2-City.mmdb file was never placed on the production server, so
  `resolveIpLocation()` fell back to CDN headers only (`cf-ipcountry` gives
  country alone; `cf-ipcity`/`cf-region` are Cloudflare Enterprise-only).
  Fix: opt-in HTTP geo fallback in `lib/geoIp.ts` — when the MMDB yields
  nothing and `GEOIP_HTTP_FALLBACK=1` is set, the server resolves
  country/region/city via the free ipwho.is API (no key) with a 2.5s timeout;
  failures fall through silently and never invent data. HTTP results are
  cached 12h in memory and Redis like MMDB results. New `geoSource` value
  `"http_api"` added to unions in `lib/geoIp.ts`, `lib/types.ts`
  (`SubscriberDetails`), diagnostics mapping, `deriveGeoSource` priority in
  both stores (ip_geo > http_api > cdn_header), and `collectSubscriberDetails`
  preserves it. Env documented in `.env.example`. Tests:
  `tests/geoIpAnalytics.test.ts` (mocked fetch: resolves, caches, refuses,
  network errors, private IPs never queried, stays off unless enabled,
  diagnostics + subscriber-details end to end). Deployment: set
  `GEOIP_HTTP_FALLBACK=1` in the Hostinger Node.js app env vars and restart.
  Old subscribers keep "Unknown" (only an IP hash is stored, so they cannot
  be backfilled); new subscriptions resolve correctly.

