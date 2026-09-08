export type PushSupport = 'supported' | 'ios-install' | 'ios-update' | 'unsupported' | 'insecure' | 'blocked';

export function pushSupport(input: {
  userAgent: string;
  touchPoints: number;
  standalone: boolean;
  secure: boolean;
  hasPush: boolean;
  permission?: string;
}): PushSupport {
  if (!input.secure) return 'insecure';
  const ios = /iPhone|iPad|iPod/i.test(input.userAgent) || (/Macintosh/i.test(input.userAgent) && input.touchPoints > 1);
  if (ios) {
    const version = input.userAgent.match(/OS (\d+)[_.](\d+)/);
    if (version && (+version[1] < 16 || (+version[1] === 16 && +version[2] < 4))) return 'ios-update';
    if (!input.standalone) return 'ios-install';
  }
  if (!input.hasPush) return 'unsupported';
  return input.permission === 'denied' ? 'blocked' : 'supported';
}
