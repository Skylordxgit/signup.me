"use client";

import { useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { adminApi } from '@/lib/admin';
import type { PublicWorkspaceUser } from '@/lib/workspaceUsers';
import { Dialog, Field, IconButton, SectionHeading } from './AdminUI';

export function UsersView({ role }: { role: 'owner' | 'admin' }) {
  const [users, setUsers] = useState<PublicWorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<'create' | PublicWorkspaceUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    let cancelled = false;
    adminApi<PublicWorkspaceUser[]>('/api/admin/users').then(data => { if (!cancelled) setUsers(data); }).catch(cause => { if (!cancelled) setError(cause.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  async function update(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setForm(null); setPassword('');
      setMessage(success);
      setUsers(await adminApi<PublicWorkspaceUser[]>('/api/admin/users'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }
  function openForm(value: 'create' | PublicWorkspaceUser) { setError(''); setPassword(''); setName(''); setEmail(''); setForm(value); }
  return <>
    <SectionHeading title="Workspace team"><button type="button" className="admButton admPrimary" disabled={busy} onClick={() => openForm('create')}><Plus size={16} />Add admin</button></SectionHeading>
    <p className="admMuted">{role === 'owner' ? 'Owners and admins can add admins for this workspace.' : 'Admins can add other admins. Workspace owner details are hidden from admin accounts.'}</p>
    {error && !form && <p className="admError" role="alert">{error}</p>}
    {message && <p className="admSuccess" role="status">{message}</p>}
    {loading ? <p role="status">Loading team...</p> : <div className="admTeamList">{users.map(user => <article key={user.id} className="admTeamRow"><ShieldCheck size={20} /><div><strong>{user.name}</strong><small>{user.email}</small></div><span className="admBadge">{user.role}</span><span className={`admBadge admBadge-${user.active ? 'published' : 'disabled'}`}>{user.active ? 'Active' : 'Disabled'}</span><div className="admActionRow">{user.role === 'admin' && <><IconButton icon={KeyRound} label={`Reset password for ${user.name}`} disabled={busy} onClick={() => openForm(user)} /><IconButton icon={user.active ? UserX : UserCheck} label={`${user.active ? 'Disable' : 'Enable'} ${user.name}`} disabled={busy} onClick={() => void update(() => adminApi('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: user.id, action: 'access', active: !user.active }) }), `${user.name} ${user.active ? 'disabled' : 'enabled'}.`)} /></>}</div></article>)}</div>}
    {form && <Dialog title={form === 'create' ? 'Add admin' : `Reset password: ${form.name}`} onClose={() => { if (!busy) { setForm(null); setPassword(''); } }}><form onSubmit={event => { event.preventDefault(); void update(() => adminApi('/api/admin/users', { method: form === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(form === 'create' ? { name, email, password } : { id: form.id, action: 'password', password }) }), form === 'create' ? 'Admin added. Share the login details privately with your teammate.' : 'Password reset. Previous sessions are signed out.'); }}><fieldset disabled={busy} className="admTeamFields"><div className="admFormStack">{form === 'create' && <><Field label="Name"><input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Email"><input required type="email" maxLength={190} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></Field><Field label="Role"><input readOnly value="Admin" /></Field></>}<Field label="Password (at least 8 characters)"><input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>{error && <p className="admError" role="alert">{error}</p>}<button type="submit" className="admButton admPrimary">{busy ? 'Saving...' : form === 'create' ? 'Create admin' : 'Reset password'}</button></div></fieldset></form></Dialog>}
  </>;
}
