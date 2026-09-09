# Workspace team

The existing account configured through ADMIN_EMAIL and ADMIN_PASSWORD_HASH is
the workspace Owner. Its credentials and access remain managed in hosting settings.

The Owner and existing admins can open Team and choose Add admin. Enter the
teammate's name, email, and a password of 8-128 characters. Share these
credentials privately; this flow creates an account directly and does not send
an email invitation.

Admins sign in at /admin/login and share all pages, media, analytics, and
notification campaigns. They can create other admin accounts, reset admin
passwords, and enable/disable admin accounts. Workspace owner details are only
returned to the Owner, so admins do not see the Owner in Team.

Disabling an admin or resetting their password invalidates their existing
sessions on the next request. Re-enabling an account requires a fresh login.
The Owner cannot be disabled through Team.

Production accounts persist in the MySQL workspace_users table, created
automatically on first use. Local development without MySQL uses the ignored
data/workspace-users.json file. Passwords are stored as salted scrypt hashes,
never included in account-list responses.
