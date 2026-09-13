import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage<Map<string, string>>();
export async function cookies() {
  const values = context.getStore();
  if (!values) throw new Error('Test request context required');
  return {
    get: (key: string) => values.has(key) ? { value: values.get(key)! } : undefined,
    set: (key: string, value: string) => { values.set(key, value); },
    delete: (key: string) => { values.delete(key); },
  };
}
export function withSession<T>(token: string | undefined, run: () => Promise<T>) {
  return context.run(new Map(token ? [['smartlink_session', token]] : []), run);
}
