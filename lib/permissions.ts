export const workspacePermissions = ['pages', 'analytics', 'media', 'notifications', 'team'] as const;
export type WorkspacePermission = typeof workspacePermissions[number];
export type WorkspaceRole = 'owner' | 'member';

export function parsePermissions(value: unknown): WorkspacePermission[] {
  if (typeof value === 'string') value = JSON.parse(value);
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !workspacePermissions.includes(item))) throw new Error('Invalid workspace permissions.');
  return [...new Set(value)] as WorkspacePermission[];
}

export function canAccess(session: { role?: string; isMaster?: boolean; permissions?: WorkspacePermission[] }, permission: WorkspacePermission) {
  return session.isMaster === true || session.role === 'owner' || session.role === 'admin' || session.permissions?.includes(permission) === true;
}
