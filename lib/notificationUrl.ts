export function isNotificationUrl(input: string) {
  const value = input.trim();
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch { return false; }
}
