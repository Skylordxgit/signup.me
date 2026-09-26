"use client";

import { Bell, CheckCircle2, Lock, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveNotificationPrompt, resolveNotificationPromptTheme, type NotificationPromptSettings } from '@/lib/notificationPrompt';
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

function keysEqual(buffer: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== key[i]) return false;
  }
  return true;
}

async function preparePush() {
  let response: Response | null = null;
  try {
    response = await timedFetch('/api/public/push-config', { cache: 'no-store' });
  } catch {
    response = null;
  }
  if (!response || !response.ok) {
    response = await timedFetch('/api/notifications/vapid-public-key', { cache: 'no-store' });
  }
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
  const theme = resolveNotificationPromptTheme(settings);
  const isGated = theme.required;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [support, setSupport] = useState<PushSupport>('supported');
  const [shake, setShake] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  }

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
      if (isGated) {
        document.documentElement.classList.add('pushPromptGatedActive');
      }
      if (typeof dialog.current.showModal === 'function') dialog.current.showModal();
      else {
        dialog.current.setAttribute('open', '');
        dialog.current.classList.add('pushPromptFallback');
      }
    }

    async function syncSubscription() {
      try {
        const { registration, publicKey } = await preparePush();
        const decodedKey = decodePublicKey(publicKey);
        const existing = await registration.pushManager.getSubscription();

        let subscription = existing;
        let shouldSave = false;

        if (existing) {
          const existingKey = existing.options?.applicationServerKey;
          const keysMatch = Boolean(existingKey && keysEqual(existingKey, decodedKey));
          if (!keysMatch) {
            // Active VAPID key was changed on server! Silently renew subscription with current key
            try {
              await existing.unsubscribe();
            } catch {}
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: decodedKey,
            });
            shouldSave = true;
          }
        } else {
          // Permission is granted but push subscription object is missing in browser
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodedKey,
          });
          shouldSave = true;
        }

        if (subscription && (shouldSave || preference(slug) !== 'saved-v2')) {
          await timedFetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              slug,
              subscription: subscription.toJSON(),
              deviceHints: {
                touchPoints: navigator.maxTouchPoints || 0,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                permission: Notification.permission,
              },
            }),
          }, 15000);
          preference(slug, 'saved-v2');
        }
      } catch {
        // If silent sync encounters any issue, only show dialog if user hasn't saved preference
        if (preference(slug) !== 'saved-v2') {
          show();
        }
      }
    }

    if (mode === 'supported' && Notification.permission === 'granted') {
      void syncSubscription();
    } else {
      void Promise.resolve().then(show);
    }

    return () => {
      cancelled = true;
      document.documentElement.classList.remove('pushPromptGatedActive');
    };
  }, [slug, isGated]);

  function dismiss() {
    if (isGated && !unlocked && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) {
      triggerShake();
      return;
    }
    document.documentElement.classList.remove('pushPromptGatedActive');
    if (typeof dialog.current?.close === 'function') dialog.current.close();
    else dialog.current?.removeAttribute('open');
  }

  async function checkBlockedRetry() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await allow();
    } else {
      triggerShake();
      setError('Please tap the lock / settings icon in your browser address bar to Allow notifications, then try again.');
    }
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
      if (permission === 'denied') {
        setSupport('blocked');
        triggerShake();
        return;
      }
      if (permission !== 'granted') {
        if (isGated) triggerShake();
        else dismiss();
        return;
      }
      const { registration, publicKey } = await preparePush();
      const decodedKey = decodePublicKey(publicKey);
      const existing = await registration.pushManager.getSubscription();

      let subscription = existing;
      if (existing) {
        const existingKey = existing.options?.applicationServerKey;
        const keysMatch = Boolean(existingKey && keysEqual(existingKey, decodedKey));
        if (!keysMatch) {
          try {
            await existing.unsubscribe();
          } catch {
            // Ignore error during unsubscribe
          }
          subscription = null;
        }
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodedKey,
        });
      }

      const response = await timedFetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          subscription: subscription.toJSON(),
          deviceHints: {
            touchPoints: navigator.maxTouchPoints || 0,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            permission: Notification.permission,
          },
        }),
      }, 15000);
      if (!response.ok) throw new Error('Your subscription was not saved. Please try again.');
      preference(slug, 'saved-v2');

      setUnlocked(true);
      setTimeout(() => {
        document.documentElement.classList.remove('pushPromptGatedActive');
        if (typeof dialog.current?.close === 'function') dialog.current.close();
        else dialog.current?.removeAttribute('open');
      }, 700);
    } catch {
      setError(copy.errorMessage);
      triggerShake();
    } finally { setBusy(false); }
  }

  return <dialog
    ref={dialog}
    className={`pushPrompt pushPromptWidget pushPrompt-${theme.position} pushPrompt-${theme.widgetType} ${shake ? 'pushPromptShakeModal' : ''} ${unlocked ? 'pushPromptUnlocked' : ''}`}
    data-gated={isGated ? 'true' : 'false'}
    data-show-desktop={String(theme.showDesktop)}
    data-show-tablet={String(theme.showTablet)}
    data-show-mobile={String(theme.showMobile)}
    dir="auto"
    aria-label={copy.heading}
    style={{
      ['--prompt-card-bg' as string]: theme.cardBackground,
      ['--prompt-text-color' as string]: theme.textColor,
      ['--prompt-btn-bg' as string]: theme.buttonColor,
      ['--prompt-btn-color' as string]: theme.buttonTextColor,
      ['--prompt-icon-color' as string]: theme.iconColor,
      ['--prompt-icon-bg' as string]: theme.iconBackground,
      ['--prompt-offset-x' as string]: `${theme.offsetX}px`,
      ['--prompt-offset-y' as string]: `${theme.offsetY}px`,
      ['--prompt-radius' as string]: `${theme.borderRadius}px`,
      ['--prompt-shadow' as string]: `0 ${Math.round(theme.shadow / 2)}px ${theme.shadow}px rgba(0,0,0,.28)`,
      ['--prompt-size' as string]: `${theme.size}px`,
    }}
    onCancel={event => {
      event.preventDefault();
      if (!isGated) dismiss();
      else triggerShake();
    }}
    onClick={event => {
      if (event.target === event.currentTarget) {
        if (!isGated) dismiss();
        else triggerShake();
      }
    }}
  >
    {isGated && <div className="pushPromptBadge" aria-label="Access required">
      <Lock size={13} aria-hidden="true" />
      <span>{copy.requiredBadge || 'Action Required to View Page'}</span>
    </div>}

    <span className="pushPromptIcon" aria-hidden="true">
      {unlocked ? <CheckCircle2 size={32} /> : isGated ? <Lock size={30} /> : theme.iconMode === 'custom' && theme.iconUrl ? <img src={theme.iconUrl} alt="" /> : <Bell size={30} />}
    </span>

    <strong>{unlocked ? (copy.successHeading || "You're subscribed!") : copy.heading}</strong>
    <p className="pushPromptPage">{title || 'This page'}</p>
    <p>{unlocked ? (copy.successMessage || 'Page is unlocked. Enjoy browsing!') : copy.message}</p>
    {error && <p className="pushPromptError" role="alert">{error}</p>}

    {support !== 'supported' ? <div className="pushPromptHelp" role="status">
      {support === 'ios-install' ? <>
        <strong>{copy.installHeading}</strong>
        <p>{copy.installMessage}</p>
        <ol>
          <li>{copy.installStepOne}</li>
          <li>{copy.installStepTwo}</li>
          <li>{copy.installStepThree}</li>
        </ol>
      </> : <>
        <p>{support === 'ios-update' ? copy.updateMessage : support === 'blocked' ? copy.blockedMessage : support === 'insecure' ? copy.secureMessage : copy.unsupportedMessage}</p>
        {support === 'blocked' && (
          <button type="button" className={`pushPromptAllow pushPromptAnim_${theme.buttonAnimation}`} onClick={() => void checkBlockedRetry()}>
            <RefreshCw size={15} style={{ marginRight: 6, display: 'inline' }} />
            Check Permission & Unlock
          </button>
        )}
      </>}
    </div> : !unlocked && (
      <button
        type="button"
        className={`pushPromptAllow pushPromptAnim_${theme.buttonAnimation}`}
        disabled={busy}
        onClick={() => void allow()}
      >
        {busy ? copy.busyLabel : error ? copy.retryLabel : copy.allowLabel}
      </button>
    )}
  </dialog>;
}
