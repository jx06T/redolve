import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { progressChannel, progressPlanService } from '../services/progressPlanService';
export function useProgressPlans() {
  const user = useStore(s => s.currentUser), account = isGuestUser(user) ? 'guest' : user!.id;
  const channel = progressChannel(account);
  const snapshot = useSyncExternalStore(listener => { channel.listeners.add(listener); return () => { channel.listeners.delete(listener); }; }, () => channel.snapshot);
  useEffect(() => { void progressPlanService.refresh(channel); }, [channel]);
  return { channel, snapshot, service: progressPlanService };
}
