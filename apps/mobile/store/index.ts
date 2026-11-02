/**
 * The app's store instance: expo-sqlite key-value storage, expo-crypto ids, the real clock.
 * Writes are debounced by 300 ms and flushed when the app leaves the foreground.
 */
import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { randomUUID } from 'expo-crypto';
import { useStore } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createSplitrStore, type SplitrState } from './create-store';

// The synchronous kv-store API keeps hydration synchronous, so the first render already knows `hydrated`.
const sqliteStorage: StateStorage = {
  getItem: (name) => Storage.getItemSync(name),
  setItem: (name, value) => {
    Storage.setItemSync(name, value);
  },
  removeItem: (name) => {
    Storage.removeItemSync(name);
  },
};

export const splitrStore = createSplitrStore({
  storage: sqliteStorage,
  newId: randomUUID,
  now: () => new Date().toISOString(),
  saveDelayMs: 300,
  onSaveError: (e) => {
    console.warn('Splitr: could not save', e);
  },
});

// Flush a pending debounced write as soon as the app is backgrounded.
AppState.addEventListener('change', (status) => {
  if (status !== 'active') splitrStore.flush();
});

export function useSplitr<T>(selector: (state: SplitrState) => T): T {
  return useStore(splitrStore, selector);
}

export * from './selectors';
export type { SplitrState, RemovedItem } from './create-store';
