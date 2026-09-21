export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

export function usePathname() {
  return '/admin/master';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function redirect(url: string) {
  throw new Error(`REDIRECT:${url}`);
}

export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}
