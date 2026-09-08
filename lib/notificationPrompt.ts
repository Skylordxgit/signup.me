export const notificationPromptDefaults = {
  heading: 'Stay up to date',
  message: 'Get new links, offers, and announcements from this page straight to your browser.',
  allowLabel: 'Allow notifications',
  footer: 'You can turn notifications off in your browser settings.',
  closeLabel: 'Close notification prompt',
  busyLabel: 'Subscribing...',
  retryLabel: 'Try again',
  errorMessage: 'Could not save your subscription. Please try again.',
  successHeading: "You're subscribed",
  successMessage: 'New announcements and offers can now reach this browser.',
  continueLabel: 'Continue to page',
  installHeading: 'Set up notifications on iPhone or iPad',
  installMessage: 'Requires iOS or iPadOS 16.4 or later and a Home Screen web app.',
  installStepOne: 'Open this page in Safari and tap Share (or More, then Share).',
  installStepTwo: 'Choose Add to Home Screen. Keep Open as Web App enabled if shown, then tap Add.',
  installStepThree: 'Open the new Home Screen icon and tap Allow notifications.',
  updateMessage: 'Web notifications require iOS or iPadOS 16.4 or later. Update your device, then add this page to your Home Screen.',
  unsupportedMessage: 'This browser cannot receive web notifications. On Android, open this link in an updated Chrome, Firefox, Edge, or Samsung Internet browser. In-app browsers and some older devices do not support notifications.',
  blockedMessage: 'Notifications are blocked. Enable them for this site or Home Screen app in your browser and device settings, then reopen this page.',
  secureMessage: 'Open this page using HTTPS to set up notifications.',
  dataNotice: 'When you subscribe, the page owner can see your reported device/browser, time zone, and IP address and approximate location when available. This does not reveal your identity or precise location.',
};

export type NotificationPromptCopyKey = keyof typeof notificationPromptDefaults;
export type NotificationPromptSettings = Partial<Record<NotificationPromptCopyKey, string>> & {
  enabled?: boolean;
};

export function isNotificationPromptEnabled(settings?: NotificationPromptSettings) {
  return settings?.enabled === true;
}

export function resolveNotificationPrompt(settings?: NotificationPromptSettings) {
  const result = { ...notificationPromptDefaults };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const value = settings?.[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, 400);
  }
  return result;
}
