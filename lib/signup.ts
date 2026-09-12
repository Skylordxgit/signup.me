import { hashPassword, ownerEmail } from './auth';
import { isMasterEmail } from './master';
import { isSignupEnabled } from './signupSettings';
import { addWorkspaceUser, findWorkspaceUser, isPendingInvite, updateWorkspaceUser, type WorkspaceUser } from './workspaceUsers';
import { createWorkspace, ensureDefaultWorkspace, isWorkspaceActive, workspaceName } from './workspaces';

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

export type SignupResult = { email: string; workspaceId: string; role: 'owner' | 'admin'; version: number; joinedInvite: boolean };

/** Self-service signup.
 *
 *  An email that a workspace already invited keeps its pending record and is
 *  activated inside THAT workspace. Any other email gets a brand-new workspace
 *  that it owns — never the default one. */
export async function signUp(input: { email: unknown; password: unknown; name?: unknown }): Promise<SignupResult> {
  if (!(await isSignupEnabled())) throw new Error('Signup is currently turned off. Please contact the administrator.');

  const email = assertEmail(normalizeEmail(input.email));
  const password = assertPassword(input.password);

  if (email === ownerEmail()) throw new Error('This email already has an account. Please sign in instead.');
  if (isMasterEmail(email)) throw new Error('This email cannot be used for a workspace account.');

  const existing = await findWorkspaceUser(email);
  const passwordHash = hashPassword(password);

  if (existing) {
    // Only a pending invite may be claimed; a real account must sign in.
    if (!isPendingInvite(existing)) throw new Error('This email already has an account. Please sign in instead.');
    if (!existing.active) throw new Error('This invitation is no longer active. Ask your workspace admin to re-send it.');
    if (!(await isWorkspaceActive(existing.workspaceId))) throw new Error('This workspace is disabled. Contact your administrator.');
    const name = displayName(input.name || existing.name, email);
    await updateWorkspaceUser(existing.id, { passwordHash, name });
    return claimed(existing);
  }

  // A new person gets their own workspace and owns it.
  await ensureDefaultWorkspace(ownerEmail());
  const name = displayName(input.name, email);
  const workspace = await createWorkspace({ name: workspaceName(email), ownerEmail: email });
  await addWorkspaceUser({ email, name, passwordHash, workspaceId: workspace.id, role: 'owner' });
  return { email, workspaceId: workspace.id, role: 'owner', version: 1, joinedInvite: false };
}

function claimed(user: WorkspaceUser): SignupResult {
  return {
    email: user.email,
    workspaceId: user.workspaceId,
    role: user.role,
    // updateWorkspaceUser bumps the session version, so the new login must
    // carry the bumped one or it would be rejected immediately.
    version: user.version + 1,
    joinedInvite: true,
  };
}

export { displayName };
