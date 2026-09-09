"use client";

import { useEffect, useState } from 'react';
import { KeyRound, MailPlus, Plus, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { adminApi } from '@/lib/admin';
import { Dialog, Field, IconButton, SectionHeading } from './AdminUI';

type TeamUser = {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  role: 'owner' | 'admin';
  active: boolean;
  pending: boolean;
  createdAt: string;
};

export function UsersView({ role }: { role: 'owner' | 'admin' }) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<'create' | TeamUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await action();
      setForm(null); setPassword('');
      setMessage(success);
      setUsers(await adminApi<TeamUser[]>('/api/admin/users'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }
  function openForm(value: 'create' | TeamUser) { setError(''); setPassword(''); setName(''); setEmail(''); setWithPassword(false); setForm(value); }
  const creating = form === 'create';
  return <>
    <SectionHeading title="Workspace team"><button type="button" className="admButton admPrimary" disabled={busy} onClick={() => openForm('create')}><Plus size={16} />Invite admin</button></SectionHeading>
    <p className="admMuted">{role === 'owner' ? 'Owners and admins can invite admins to this workspace.' : 'Admins can invite other admins. Workspace owner details are hidden from admin accounts.'} Invite by email and the person joins this workspace when they sign up.</p>
    {error && !form && <p className="admError" role="alert">{error}</p>}
    {message && <p className="admSuccess" role="status">{message}</p>}
    {loading ? <p role="status">Loading team...</p> : <div className="admTeamList">{users.map(user => <article key={user.id} className="admTeamRow">
      {user.pending ? <MailPlus size={20} /> : <ShieldCheck size={20} />}
      <div><strong>{user.name}</strong><small>{user.email}</small></div>
      <span className="admBadge">{user.role}</span>
      <span className={`admBadge admBadge-${user.pending ? '' : user.active ? 'published' : 'disabled'}`}>{user.pending ? 'Invited' : user.active ? 'Active' : 'Disabled'}</span>
      <div className="admActionRow">{user.role === 'admin' && <>
        {!user.pending && <IconButton icon={KeyRound} label={`Reset password for ${user.name}`} disabled={busy} onClick={() => openForm(user)} />}
        <IconButton icon={user.active ? UserX : UserCheck} label={`${user.active ? 'Disable' : 'Enable'} ${user.name}`} disabled={busy} onClick={() => void update(() => adminApi('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: user.id, action: 'access', active: !user.active }) }), `${user.name} ${user.active ? 'disabled' : 'enabled'}.`)} />
        {user.pending && <IconButton icon={Trash2} label={`Cancel invitation for ${user.email}`} disabled={busy} onClick={() => void update(() => adminApi('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ id: user.id }) }), 'Invitation cancelled.')} />}
      </>}</div>
    </article>)}</div>}
    {form && <Dialog title={creating ? 'Invite admin' : `Reset password: ${form.name}`} onClose={() => { if (!busy) { setForm(null); setPassword(''); } }}>
      <form onSubmit={event => {
        event.preventDefault();
        void update(
          () => adminApi('/api/admin/users', {
            method: creating ? 'POST' : 'PATCH',
            body: JSON.stringify(creating ? { name, email, password: withPassword ? password : undefined } : { id: form.id, action: 'password', password }),
          }),
          creating
            ? withPassword ? 'Admin added. Share the login details privately with your teammate.' : 'Invitation saved. They join this workspace when they sign up with that email.'
            : 'Password reset. Previous sessions are signed out.',
        );
      }}>
        <fieldset disabled={busy} className="admTeamFields"><div className="admFormStack">
          {creating && <>
            <Field label="Name"><input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></Field>
            <Field label="Email"><input required type="email" maxLength={190} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></Field>
            <Field label="Role"><input readOnly value="Admin" /></Field>
            <label className="admCheck"><input type="checkbox" checked={withPassword} onChange={event => setWithPassword(event.target.checked)} />Set a password now</label>
            {!withPassword && <p className="admMuted">Leave this off to invite by email only. They keep this workspace when they create their account.</p>}
          </>}
          {(!creating || withPassword) && <Field label="Password (at least 8 characters)"><input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>}
          {error && <p className="admError" role="alert">{error}</p>}
          <button type="submit" className="admButton admPrimary">{busy ? 'Saving...' : creating ? withPassword ? 'Create admin' : 'Send invitation' : 'Reset password'}</button>
        </div></fieldset>
      </form>
    </Dialog>}
  </>;
}
