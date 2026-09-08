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
};

export type NotificationPromptSettings = Partial<typeof notificationPromptDefaults>;

export function resolveNotificationPrompt(settings?: NotificationPromptSettings) {
  const result = { ...notificationPromptDefaults };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const value = settings?.[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, 400);
  }
  return result;
}
