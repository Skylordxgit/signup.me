"use client";

import { Bell, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

export function NotificationOptIn({ slug, title }: { slug: string; title: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const publicKey = useRef('');
  const worker = useRef<ServiceWorkerRegistration | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied' || preference(slug) === 'dismissed') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function prepare() {
      try {
        const response = await fetch('/api/notifications/vapid-public-key', { signal: controller.signal });
        const data = await response.json() as { enabled?: boolean; publicKey?: string };
        if (!response.ok || !data.enabled || !data.publicKey) return;
        await navigator.serviceWorker.register('/push-worker.js');
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        worker.current = registration;
        publicKey.current = data.publicKey;
        const existing = await registration.pushManager.getSubscription();
        if (existing && Notification.permission === 'granted' && preference(slug) === 'saved-v2') return;
        if (!cancelled) timer = setTimeout(() => setVisible(true), 1400);
      } catch { /* Public content stays available when push setup fails. */ }
    }
    void prepare();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [slug]);

  useEffect(() => {
    if (visible) dialog.current?.showModal();
    else dialog.current?.close();
  }, [visible]);

  function dismiss() {
    if (!success) preference(slug, 'dismissed');
    setVisible(false);
  }

  async function allow() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Keep the permission request directly in the user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { dismiss(); return; }
      const registration = worker.current;
      if (!registration) throw new Error('Please refresh the page and try again.');
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(publicKey.current),
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not subscribe. Please try again.');
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="pushPrompt" aria-label="Page updates" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <button type="button" className="pushPromptClose" aria-label="Close notification prompt" onClick={dismiss}><X size={20} /></button>
    <span className="pushPromptIcon" aria-hidden="true">{success ? <Check size={30} /> : <Bell size={30} />}</span>
    <strong>{success ? "You're subscribed" : 'Stay up to date'}</strong>
    <p className="pushPromptPage">{title || 'This page'}</p>
    <p>{success ? 'New announcements and offers can now reach this browser.' : 'Get new links, offers, and announcements from this page straight to your browser.'}</p>
    {error && <p className="pushPromptError" role="alert">{error}</p>}
    {success ? <button type="button" className="pushPromptAllow" onClick={dismiss}>Continue to page</button> : <>
      <button type="button" className="pushPromptAllow" disabled={busy} onClick={() => void allow()}>{busy ? 'Subscribing...' : error ? 'Try again' : 'Allow notifications'}</button>
      <button type="button" className="pushPromptSkip" onClick={dismiss}>Continue without notifications</button>
      <small>You can turn notifications off in your browser settings.</small>
    </>}
  </dialog>;
}
