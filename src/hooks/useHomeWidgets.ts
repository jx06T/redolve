import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { homeWidgetService, loadWidgets, widgetChannel } from '../services/homeWidgetService';
import { DAY_MS, taipeiDay } from '../types/homeWidgets';
export function useHomeWidgets() {
  const user = useStore(s => s.currentUser);
  const account = isGuestUser(user) ? 'guest' : user!.id;
  const channel = widgetChannel(account);
  const snapshot = useSyncExternalStore(listener => { channel.listeners.add(listener); return () => { channel.listeners.delete(listener); }; }, () => channel.snapshot);
  useEffect(() => {
    void loadWidgets(channel);
    let timer: number;
    const tick = () => {
      clearTimeout(timer);
      homeWidgetService.tick(channel);
      timer = window.setTimeout(() => { void loadWidgets(channel, true); tick(); }, (taipeiDay() + 1) * DAY_MS - 8 * 3600000 - Date.now() + 100);
    };
    const visible = () => { if (document.visibilityState === 'visible') { tick(); void loadWidgets(channel); } };
    tick(); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [channel]);
  return { channel, snapshot, service: homeWidgetService };
}
