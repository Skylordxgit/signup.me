// Client-safe login transport; only confirmed JSON success permits navigation.
export async function submitLogin(input: { email: unknown; password: unknown }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
      body: JSON.stringify(input),
    });
    const data: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('Sign in took too long. Please try again.');
    if (!data || typeof data !== 'object') throw new Error('Could not confirm sign in. Please try again.');
    if (!response.ok || !('ok' in data) || data.ok !== true) {
      throw new Error('error' in data && typeof data.error === 'string' ? data.error : 'Sign in failed. Please try again.');
    }
    return { redirect: 'redirect' in data && data.redirect === '/admin/master' ? '/admin/master' : '/admin/dashboard' };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Sign in took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('Could not connect. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
