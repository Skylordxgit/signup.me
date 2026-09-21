export const notificationPromptDefaults = {
  heading: 'Stay up to date',
  message: 'Get new links, offers, and announcements from this page straight to your browser.',
  allowLabel: 'Allow notifications',
  requiredBadge: '🔒 Action Required to View Page',
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

export type NotificationPromptAnimation =
  | 'pulse'
  | 'shine'
  | 'shake'
  | 'glow'
  | 'bounce'
  | 'ripple'
  | 'none';

export type NotificationPromptThemePreset = {
  id: string;
  label: string;
  buttonColor: string;
  buttonTextColor: string;
  cardBackground: string;
  textColor: string;
  iconColor: string;
  iconBackground: string;
};

export const notificationPromptPresets: NotificationPromptThemePreset[] = [
  { id: 'default', label: 'Classic Blue', buttonColor: '#2465d7', buttonTextColor: '#ffffff', cardBackground: '#ffffff', textColor: '#17212f', iconColor: '#2465d7', iconBackground: '#edf4ff' },
  { id: 'dark', label: 'Midnight Dark', buttonColor: '#3b82f6', buttonTextColor: '#ffffff', cardBackground: '#111827', textColor: '#f9fafb', iconColor: '#60a5fa', iconBackground: '#1f2937' },
  { id: 'emerald', label: 'Emerald Mint', buttonColor: '#059669', buttonTextColor: '#ffffff', cardBackground: '#ffffff', textColor: '#064e3b', iconColor: '#059669', iconBackground: '#d1fae5' },
  { id: 'purple', label: 'Cyber Violet', buttonColor: '#7c3aed', buttonTextColor: '#ffffff', cardBackground: '#0f0c20', textColor: '#f5f3ff', iconColor: '#a78bfa', iconBackground: '#2e1065' },
  { id: 'crimson', label: 'Crimson Gate', buttonColor: '#dc2626', buttonTextColor: '#ffffff', cardBackground: '#ffffff', textColor: '#1f2937', iconColor: '#dc2626', iconBackground: '#fee2e2' },
  { id: 'amber', label: 'Golden Sunset', buttonColor: '#d97706', buttonTextColor: '#ffffff', cardBackground: '#fffbeb', textColor: '#451a03', iconColor: '#d97706', iconBackground: '#fef3c7' },
  { id: 'neon', label: 'Neon Cyber', buttonColor: '#06b6d4', buttonTextColor: '#050c1a', cardBackground: '#0b1120', textColor: '#e2e8f0', iconColor: '#22d3ee', iconBackground: '#164e63' },
];

export type NotificationPromptSettings = Partial<Record<NotificationPromptCopyKey, string>> & {
  enabled?: boolean;
  required?: boolean;
  preset?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  cardBackground?: string;
  textColor?: string;
  iconColor?: string;
  iconBackground?: string;
  buttonAnimation?: NotificationPromptAnimation;
};

export function isNotificationPromptEnabled(settings?: NotificationPromptSettings) {
  return settings?.enabled === true;
}

export function isNotificationPromptRequired(settings?: NotificationPromptSettings) {
  return settings?.enabled === true && settings?.required === true;
}

export function resolveNotificationPrompt(settings?: NotificationPromptSettings) {
  const result = { ...notificationPromptDefaults };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const value = settings?.[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, 400);
  }
  return result;
}

export function resolveNotificationPromptTheme(settings?: NotificationPromptSettings) {
  return {
    buttonColor: settings?.buttonColor || '#2465d7',
    buttonTextColor: settings?.buttonTextColor || '#ffffff',
    cardBackground: settings?.cardBackground || '#ffffff',
    textColor: settings?.textColor || '#17212f',
    iconColor: settings?.iconColor || (settings?.buttonColor || '#2465d7'),
    iconBackground: settings?.iconBackground || '#edf4ff',
    buttonAnimation: (settings?.buttonAnimation || 'pulse') as NotificationPromptAnimation,
    required: settings?.required === true,
  };
}
