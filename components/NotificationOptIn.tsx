"use client";

import { Bell, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveNotificationPrompt, type NotificationPromptSettings } from '@/lib/notificationPrompt';

function preference(slug: string, value?: string) {
  try {
    const key = 'signup888_push_prompt_' + slug;
    if (value) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch { return null; }
}

function decodePublicKey(value: string) {
  const raw = atob((value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function preparePush() {
  const response = await fetch('/api/notifications/vapid-public-key', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
  const data = await response.json() as { enabled?: boolean; publicKey?: string };
  if (!response.ok || !data.enabled || !data.publicKey) throw new Error('Push unavailable');
  await navigator.serviceWorker.register('/push-worker.js');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Push setup timed out')), 10000); }),
    ]);
    return { registration, publicKey: data.publicKey };
  } finally { clearTimeout(timer); }
}

export function NotificationOptIn({ slug, title, settings }: { slug: string; title: string; settings?: NotificationPromptSettings }) {
  const copy = resolveNotificationPrompt(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    let cancelled = false;
    if (Notification.permission === 'granted' && preference(slug) === 'saved-v2') {
      // Only returning subscribers wait for a check; new visitors see the prompt immediately.
      void navigator.serviceWorker.getRegistration('/').then(async registration => {
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled && !existing) dialog.current?.showModal();
      }).catch(() => { if (!cancelled) dialog.current?.showModal(); });
    } else {
      dialog.current?.showModal();
    }
    return () => { cancelled = true; };
  }, [slug]);

  function dismiss() {
    dialog.current?.close();
  }

  async function allow() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Keep the permission request directly in the user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { dismiss(); return; }
      const { registration, publicKey } = await preparePush();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(publicKey),
      });
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, subscription: subscription.toJSON() }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Your subscription was not saved. Please try again.');
      preference(slug, 'saved-v2');
      setSuccess(true);
    } catch {
      setError(copy.errorMessage);
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="pushPrompt" dir="auto" aria-label={copy.heading} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <button type="button" className="pushPromptClose" aria-label={copy.closeLabel} onClick={dismiss}><X size={20} /></button>
    <span className="pushPromptIcon" aria-hidden="true">{success ? <Check size={30} /> : <Bell size={30} />}</span>
    <strong>{success ? copy.successHeading : copy.heading}</strong>
    <p className="pushPromptPage">{title || 'This page'}</p>
    <p>{success ? copy.successMessage : copy.message}</p>
    {error && <p className="pushPromptError" role="alert">{error}</p>}
    {success ? <button type="button" className="pushPromptAllow" onClick={dismiss}>{copy.continueLabel}</button> : <>
      <button type="button" className="pushPromptAllow" disabled={busy} onClick={() => void allow()}>{busy ? copy.busyLabel : error ? copy.retryLabel : copy.allowLabel}</button>
      <button type="button" className="pushPromptSkip" onClick={dismiss}>{copy.skipLabel}</button>
      <small>{copy.footer}</small>
    </>}
  </dialog>;
}
