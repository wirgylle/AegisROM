import { useSyncExternalStore } from 'react';
import { getManualGroupsVersion, subscribeManualGroups } from '../utils/manualGroups';

/** Перерисовка при изменении ручных групп. / Re-render when manual groups change. */
export function useManualGroupsVersion(): number {
  return useSyncExternalStore(subscribeManualGroups, getManualGroupsVersion, getManualGroupsVersion);
}
