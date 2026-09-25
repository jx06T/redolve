import type { User } from '../types';

export function isGuestUser(user: User | null): boolean {
  return !user?.id || (user.id === 'dev_user_default' && !import.meta.env.DEV);
}
