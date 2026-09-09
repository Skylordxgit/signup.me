/** The master admin is deliberately separate from every workspace: it is not a
 *  workspace_users row and owns no workspace, so no workspace owner can ever
 *  become one. It exists only when both environment variables are set. */
export function masterAdmin() {
  const email = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.MASTER_ADMIN_PASSWORD_HASH?.trim();
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

export function isMasterEmail(email: string) {
  const master = masterAdmin();
  return Boolean(master && master.email === email.trim().toLowerCase());
}
