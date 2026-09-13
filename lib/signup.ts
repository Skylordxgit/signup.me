import { createHash } from 'crypto';
import { hashPassword, configuredAdmin } from './auth';
import { isMasterEmail } from './master';
import { isSignupEnabled } from './signupSettings';
import { addWorkspaceUser, deleteWorkspaceUser, findWorkspaceUser, isPendingInvite, updateWorkspaceUser } from './workspaceUsers';
import { createWorkspace, isWorkspaceActive, removeEmptyWorkspace, workspaceName } from './workspaces';
import { hasMysqlConfig, withTransaction, type TransactionQuery } from './mysql';
import type { WorkspaceRole } from './permissions';

export const minimumPasswordLength = 8;

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new Error('Enter a valid email address.');
  return email;
}

export function assertPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < minimumPasswordLength || value.length > 128) {
    throw new Error(`Use a password between ${minimumPasswordLength} and 128 characters.`);
  }
  return value;
}

function displayName(value: unknown, email: string) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length > 120) throw new Error('Enter a name of up to 120 characters.');
  return name || email.split('@')[0] || 'Team member';
}

export type SignupResult = { email: string; accountId: string; workspaceId: string; role: WorkspaceRole; version: number; joinedInvite: boolean };

// JSON development storage has one writer. Production account creation uses a
// database transaction so the account and workspace commit together.
let signupQueue: Promise<unknown> = Promise.resolve();
function accountTransaction<T>(run: (query?: TransactionQuery) => Promise<T>): Promise<T> {
  if (hasMysqlConfig()) return withTransaction(run);
  const operation = signupQueue.catch(() => {}).then(() => run());
  signupQueue = operation;
  return operation;
}

/** Public signup always creates a new, independent workspace. */
export async function signUp(input: { email: unknown; password: unknown; name?: unknown }): Promise<SignupResult> {
  if (!(await isSignupEnabled())) throw new Error('Signup is currently turned off. Please contact the administrator.');

  const email = assertEmail(normalizeEmail(input.email));
  const password = assertPassword(input.password);

  if (email === configuredAdmin()?.email) throw new Error('This email already has an account. Please sign in instead.');
  if (isMasterEmail(email)) throw new Error('This email cannot be used for a workspace account.');

  const passwordHash = hashPassword(password);
  const name = displayName(input.name, email);
  return accountTransaction(async query => {
    const existing = await findWorkspaceUser(email, query);
    if (existing && !isPendingInvite(existing)) throw new Error('This email already has an account. Please sign in instead.');
    const workspace = await createWorkspace({ name: workspaceName(email), ownerEmail: email }, query);
    try {
      // A pending email is not proof of invitation acceptance. Direct signup
      // cancels that reservation and creates an independent owner account.
      if (existing) await deleteWorkspaceUser(existing.id, existing.workspaceId, query);
      const account = await addWorkspaceUser({ email, name, passwordHash, workspaceId: workspace.id, role: 'owner' }, query);
      return { email, accountId: account.id, workspaceId: workspace.id, role: 'owner', version: 1, joinedInvite: false };
    } catch (error) {
      if (!query) await removeEmptyWorkspace(workspace.id);
      throw error;
    }
  });
}

export function invitationHash(token: string) { return createHash('sha256').update(token).digest('hex'); }

export async function acceptInvitation(input: { email: unknown; password: unknown; name?: unknown; token: unknown }): Promise<SignupResult> {
  const email = assertEmail(normalizeEmail(input.email));
  const passwordHash = hashPassword(assertPassword(input.password));
  if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw new Error('Invalid invitation.');
  const tokenHash = invitationHash(input.token);
  return accountTransaction(async query => {
    const user = await findWorkspaceUser(email, query);
    if (!user?.active || !isPendingInvite(user) || user.inviteHash !== tokenHash || !user.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() <= Date.now()) throw new Error('Invalid or expired invitation.');
    if (isMasterEmail(email) || !(await isWorkspaceActive(user.workspaceId))) throw new Error('This workspace is unavailable.');
    await updateWorkspaceUser(user.id, { passwordHash, name: displayName(input.name || user.name, email) }, user.workspaceId, query);
    return { email, accountId: user.id, workspaceId: user.workspaceId, role: user.role, version: user.version + 1, joinedInvite: true };
  });
}

export { displayName };
