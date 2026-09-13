"use client";

import { useEffect, useState } from 'react';
import { Copy, KeyRound, MailPlus, Plus, Settings2, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { workspacePermissions, type WorkspaceRole, type WorkspacePermission } from '@/lib/permissions';
import { adminApi } from '@/lib/admin';
import { Dialog, Field, IconButton, SectionHeading } from './AdminUI';

type TeamUser = {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  role: WorkspaceRole;
  permissions?: WorkspacePermission[];
  active: boolean;
  pending: boolean;
  createdAt: string;
};

export function UsersView({ role, permissions, isMaster }: { role: WorkspaceRole; permissions: WorkspacePermission[]; isMaster: boolean }) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<'create' | TeamUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [assignedRole, setAssignedRole] = useState<'owner' | 'member'>('member');
  const [assignedPermissions, setAssignedPermissions] = useState<WorkspacePermission[]>([]);
  // An invite with no password stays pending until that person signs up.
  const [withPassword, setWithPassword] = useState(false);
  useEffect(() => {
    let cancelled = false;
    adminApi<TeamUser[]>('/api/admin/users').then(data => { if (!cancelled) setUsers(data); }).catch(cause => { if (!cancelled) setError(cause.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  async function update(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action() as { invitePath?: string };
      if (result?.invitePath) setInviteUrl(new URL(result.invitePath, window.location.origin).href);
      setForm(null); setPassword('');
      setMessage(success);
      setUsers(await adminApi<TeamUser[]>('/api/admin/users'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }
  function openForm(value: 'create' | TeamUser) { setError(''); setPassword(''); setName(''); setEmail(''); setWithPassword(false); setEditingPermissions(false); setAssignedRole(value !== 'create' && value.role === 'owner' ? 'owner' : 'member'); setAssignedPermissions(value !== 'create' ? value.permissions ?? [] : []); setForm(value); }
  const creating = form === 'create';
  return <>
    <SectionHeading title="Workspace team"><button type="button" className="admButton admPrimary" disabled={busy} onClick={() => openForm('create')}><Plus size={16} />Add teammate</button></SectionHeading>

    {error && !form && <p className="admError" role="alert">{error}</p>}
    {message && <p className="admSuccess" role="status">{message}</p>}
    {inviteUrl && <div className="admFormStack"><Field label="Invitation link"><input readOnly value={inviteUrl} onFocus={event => event.target.select()} /></Field><button className="admButton" type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage('Link copied.')).catch(() => setError('Could not copy link.'))}><Copy size={16} />Copy link</button></div>}
    {loading ? <p role="status">Loading team...</p> : <div className="admTeamList">{users.map(user => <article key={user.id} className="admTeamRow">
      {user.pending ? <MailPlus size={20} /> : <ShieldCheck size={20} />}
      <div><strong>{user.name}</strong><small>{user.email}</small></div>
      <span className="admBadge">{user.role === 'owner' ? 'Admin / Owner' : user.role}</span>
      <span className={`admBadge admBadge-${user.pending ? '' : user.active ? 'published' : 'disabled'}`}>{user.pending ? 'Invited' : user.active ? 'Active' : 'Disabled'}</span>
      <div className="admActionRow">{(user.role !== 'owner' || isMaster) && (role !== 'member' || isMaster || user.role === 'member' && (user.permissions ?? []).every(permission => permissions.includes(permission))) && <>
        {user.role !== 'owner' && <IconButton icon={Settings2} label={`Permissions for ${user.name}`} disabled={busy} onClick={() => { openForm(user); setEditingPermissions(true); }} />}
        {!user.pending && <IconButton icon={KeyRound} label={`Reset password for ${user.name}`} disabled={busy} onClick={() => openForm(user)} />}
        <IconButton icon={user.active ? UserX : UserCheck} label={`${user.active ? 'Disable' : 'Enable'} ${user.name}`} disabled={busy} onClick={() => void update(() => adminApi('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: user.id, action: 'access', active: !user.active }) }), `${user.name} ${user.active ? 'disabled' : 'enabled'}.`)} />
        {user.role !== 'owner' && <IconButton icon={Trash2} label={`Remove ${user.email}`} disabled={busy} onClick={() => void update(() => adminApi('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ id: user.id }) }), 'Invitation cancelled.')} />}
      </>}</div>
    </article>)}</div>}
    {form && <Dialog title={creating ? 'Add teammate' : `${editingPermissions ? 'Permissions' : 'Reset password'}: ${form.name}`} onClose={() => { if (!busy) { setForm(null); setPassword(''); } }}>
      <form onSubmit={event => {
        event.preventDefault();
        void update(
          () => adminApi('/api/admin/users', {
            method: creating ? 'POST' : 'PATCH',
            body: JSON.stringify(creating ? { name, email, role: assignedRole, permissions: assignedPermissions, password: withPassword ? password : undefined } : editingPermissions ? { id: form.id, action: 'permissions', role: assignedRole, permissions: assignedPermissions } : { id: form.id, action: 'password', password }),
          }),
          creating
            ? withPassword ? 'Account created.' : 'Invitation link created. Expires in 7 days.'
            : 'Account updated. Previous sessions are signed out.',
        );
      }}>
        <fieldset disabled={busy} className="admTeamFields"><div className="admFormStack">
          {creating && <>
            <Field label="Name"><input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></Field>
            <Field label="Email"><input required type="email" maxLength={190} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></Field>

            <label className="admCheck"><input type="checkbox" checked={withPassword} onChange={event => setWithPassword(event.target.checked)} />Set a password now</label>

          </>}
          {(creating || editingPermissions) && <>
            <Field label="Role"><select value={assignedRole} onChange={event => setAssignedRole(event.target.value as 'owner' | 'member')}><option value="member">Member</option>{(role !== 'member' || isMaster) && <option value="admin">Workspace admin</option>}</select></Field>
            {assignedRole === 'member' && <fieldset><legend>Permissions</legend>{(role === 'member' && !isMaster ? permissions : workspacePermissions).map(permission => <label className="admCheck" key={permission}><input type="checkbox" checked={assignedPermissions.includes(permission)} onChange={event => setAssignedPermissions(current => event.target.checked ? [...current, permission] : current.filter(item => item !== permission))} />{permission}</label>)}</fieldset>}
          </>}
          {(!creating && !editingPermissions || creating && withPassword) && <Field label="Password (at least 8 characters)"><input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>}
          {error && <p className="admError" role="alert">{error}</p>}
          <button type="submit" className="admButton admPrimary">{busy ? 'Saving...' : creating ? withPassword ? 'Create account' : 'Create invitation link' : 'Save'}</button>
        </div></fieldset>
      </form>
    </Dialog>}
  </>;
}
