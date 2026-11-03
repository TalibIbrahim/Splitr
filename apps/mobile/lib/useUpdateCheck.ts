import { useEffect } from 'react';
import Constants from 'expo-constants';
import { splitrStore, useSplitr } from '../store';
import { checkForUpdate, shouldCheck } from './update-check';

/** D36. Runs the daily update check once after hydration (never during recovery). */
export function useUpdateCheck(): void {
  const hydrated = useSplitr((s) => s.hydrated);
  const recovery = useSplitr((s) => s.recovery);
  useEffect(() => {
    if (!hydrated || recovery) return;
    const now = new Date().toISOString();
    if (!shouldCheck(splitrStore.getState().root.meta?.updateCheck, now)) return;
    void checkForUpdate(Constants.expoConfig?.version ?? '0.0.0').then((r) => {
      if (r) splitrStore.getState().recordUpdateCheck({ ...r, checkedAt: new Date().toISOString() });
    });
  }, [hydrated, recovery]);
}
