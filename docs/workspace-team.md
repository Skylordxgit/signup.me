# Workspaces, team, and master admin

## Workspaces

Every page, admin account, upload, and push subscriber belongs to exactly one
workspace. The workspace comes from the signed-in session, never from the
client, so a page id from another workspace reads as "not found" on every
admin API.

The workspace with id `default` is the one all pre-existing data belongs to.
`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` still identify its Owner, exactly as
before, and that account has no stored password row.

## Public signup

`/admin/signup` takes an email and a password of 8-128 characters. There is no
OTP, email verification, or approval step; the account can sign in immediately
and the signup response already carries the session.

Two outcomes, decided by whether the address was already invited:

- **Not invited anywhere** — a brand-new workspace is created and the new
  account owns it. They never join the default workspace.
- **Already invited** — the pending record kept by the inviting workspace is
  activated in place. No new workspace is created and they land in the
  workspace that invited them.

Emails are normalised to lowercase and are unique across the whole install, so
the same address cannot own two accounts. `ADMIN_EMAIL` and
`MASTER_ADMIN_EMAIL` cannot be registered through signup.

## Team

The Owner and admins open Team and choose **Invite admin**. Entering just a
name and email creates a *pending invite*: the address belongs to this
workspace straight away and shows as "Invited". When that person signs up with
it, they join this workspace as an admin rather than getting their own.

Ticking "Set a password now" instead creates a usable account immediately;
share those credentials privately, since nothing is emailed.

Admins can invite other admins, reset admin passwords, enable/disable admin
accounts, and cancel pending invites. Owner details are only returned to the
Owner, so admins never see the Owner in Team. The Owner cannot be changed
through Team.

Disabling an admin or resetting their password invalidates their existing
sessions on the next request, via the session version. Disabling a whole
workspace blocks its owner and admins from signing in; its public pages stay
online.

## Master admin

The master admin is separate from every workspace: it is not a workspace
account, owns no workspace, and no workspace owner can become one. It exists
only when both variables are set:

- `MASTER_ADMIN_EMAIL`
- `MASTER_ADMIN_PASSWORD_HASH` (a salted scrypt hash, same format as
  `ADMIN_PASSWORD_HASH`)

Signing in with that email at `/admin/login` redirects to `/admin/master`,
which lists every workspace with its name, id, owner, status, creation date,
and page/admin/subscriber counts, and can disable or re-enable a workspace.
The main workspace cannot be disabled.

The two session kinds do not overlap: a master session is refused by every
workspace API, and a workspace session is refused by every master route.

## Storage

Production uses MySQL (`workspaces`, `workspace_users`, and the `workspace_id`
column on `pages` and `uploads`). The app applies the column migrations itself
on first connection and skips ones already applied, so an existing database
upgrades in place with all current rows landing in the `default` workspace —
existing pages and public slugs are untouched.

Local development without MySQL uses the ignored `data/workspaces.json` and
`data/workspace-users.json` files, with the same rules. Passwords are stored as
salted scrypt hashes and are never included in any API response.
