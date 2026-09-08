"use client";

import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveNotificationPrompt, type NotificationPromptSettings } from '@/lib/notificationPrompt';
import { pushSupport, type PushSupport } from '@/lib/pushSupport';

async function timedFetch(url: string, options: RequestInit = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

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
  const response = await timedFetch('/api/notifications/vapid-public-key', { cache: 'no-store' });
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
  const [support, setSupport] = useState<PushSupport>('supported');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    const mode = pushSupport({
      userAgent: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints || 0,
      standalone: window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      secure: window.isSecureContext,
      hasPush: 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && 'ServiceWorkerRegistration' in window && 'showNotification' in ServiceWorkerRegistration.prototype,
      permission: 'Notification' in window ? Notification.permission : undefined,
    });
    function show() {
      if (cancelled || !dialog.current) return;
      setSupport(mode);
      if (typeof dialog.current.showModal === 'function') dialog.current.showModal();
      else {
        dialog.current.setAttribute('open', '');
        dialog.current.classList.add('pushPromptFallback');
      }
    }
    if (mode === 'supported' && Notification.permission === 'granted' && preference(slug) === 'saved-v2') {
      // Only returning subscribers wait for a check; new visitors see the prompt immediately.
      void navigator.serviceWorker.getRegistration('/').then(async registration => {
        if (registration) void registration.update().catch(() => {});
        const existing = await registration?.pushManager.getSubscription();
        if (!existing) show();
      }).catch(show);
    } else {
      void Promise.resolve().then(show);
    }
    return () => { cancelled = true; };
  }, [slug]);

  function dismiss() {
    if (typeof dialog.current?.close === 'function') dialog.current.close();
    else dialog.current?.removeAttribute('open');
  }

  async function allow() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Keep the permission request directly in the user gesture.
      const permission = await new Promise<NotificationPermission>((resolve, reject) => {
        const result = Notification.requestPermission(resolve);
        if (result) result.then(resolve, reject);
      });
      if (permission === 'denied') { setSupport('blocked'); return; }
      if (permission !== 'granted') { dismiss(); return; }
      const { registration, publicKey } = await preparePush();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(publicKey),
      });
      const response = await timedFetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, subscription: subscription.toJSON(), deviceHints: { touchPoints: navigator.maxTouchPoints || 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }),
      }, 15000);
      if (!response.ok) throw new Error('Your subscription was not saved. Please try again.');
      preference(slug, 'saved-v2');
      setSuccess(true);
    } catch {
      setError(copy.errorMessage);
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="pushPrompt" dir="auto" aria-label={copy.heading} onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <span className="pushPromptIcon" aria-hidden="true">{success ? <Check size={30} /> : <Bell size={30} />}</span>
    <strong>{success ? copy.successHeading : copy.heading}</strong>
    <p className="pushPromptPage">{title || 'This page'}</p>
    <p>{success ? copy.successMessage : copy.message}</p>
    {error && <p className="pushPromptError" role="alert">{error}</p>}
    {support !== 'supported' ? <div className="pushPromptHelp" role="status">
      {support === 'ios-install' ? <><strong>{copy.installHeading}</strong><p>{copy.installMessage}</p><ol><li>{copy.installStepOne}</li><li>{copy.installStepTwo}</li><li>{copy.installStepThree}</li></ol></>
        : <p>{support === 'ios-update' ? copy.updateMessage : support === 'blocked' ? copy.blockedMessage : support === 'insecure' ? copy.secureMessage : copy.unsupportedMessage}</p>}
    </div> : success ? <button type="button" className="pushPromptAllow" onClick={dismiss}>{copy.continueLabel}</button> : <>
      <button type="button" className="pushPromptAllow" disabled={busy} onClick={() => void allow()}>{busy ? copy.busyLabel : error ? copy.retryLabel : copy.allowLabel}</button>
      <small>{copy.footer}</small>
      <small>{copy.dataNotice}</small>
    </>}
  </dialog>;
}
