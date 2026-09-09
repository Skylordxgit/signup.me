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
- Workspace/team accounts
- Multi-workspace signup
- Master admin dashboard

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
- Master admin uses `MASTER_ADMIN_EMAIL` and `MASTER_ADMIN_PASSWORD_HASH`.
- Master sessions must not access workspace APIs, and workspace sessions must
  not access master APIs.

## Team Rules

- The configured `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` account is the owner of
  the default/main workspace.
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

Expected current test count after the multi-workspace update: 34 passing tests.

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

- 2026-09-09: Added this handoff guide so future AI agents know the current
  architecture, workflow, push process, and known pitfalls. Future agents should
  keep this section current after completing work.
- 2026-09-09: Added global branding storage/API for Master Admin branding
  controls, removed Apple login from the auth options, made the signup link a
  stronger button-style link, and wired auth/admin metadata to saved branding.
  Google login is still a placeholder until OAuth client credentials and callback
  handling are added.
