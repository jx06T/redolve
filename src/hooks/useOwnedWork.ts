import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Item } from '../types';
import { useStore } from '../store/useStore';
import { getOwnedWorkController } from '../services/ownedWorkService';
const noSubscribe = () => () => {};
const noState = () => null;
export function useOwnedWork(item: Item, enabled: boolean) {
  const account = useStore(s => s.currentUser?.id);
  const controller = useMemo(() => enabled && account === item.user_id ? getOwnedWorkController(item) : null,
    [enabled, account, item.id, item.user_id]);
  const state = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getState ?? noState);
  useEffect(() => {controller?.observeCloud(item);}, [controller, item]);
  return {controller, state};
}
