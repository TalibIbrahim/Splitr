/**
 * Persistence for the Splitr store (docs/phase1-spec.md section 4.1). Storage-agnostic and React-free:
 * it only needs the zustand `StateStorage` interface.
 *
 * Why explicit load/save instead of zustand's `persist` middleware: the recovery rule is "a failed
 * validation never wipes data" - the original key must NOT be overwritten until the user confirms.
 * With the middleware, the first state change after a failed hydration would write the empty state
 * over the original key. Here a save is only ever done through `createSaver`, which refuses to write
 * while `recovery` is set, so the guarantee lives in one place.
 */
import { PersistedRootSchema, SCHEMA_VERSION, type PersistedRoot } from '@splitr/shared-types';
import type { StateStorage } from 'zustand/middleware';

export const STORAGE_KEY = 'splitr-root';
export const BACKUP_KEY_PREFIX = 'splitr-backup-';

export function emptyRoot(): PersistedRoot {
  return { schemaVersion: SCHEMA_VERSION, me: null, people: [], groups: [], bills: [] };
}

export type LoadOutcome =
  | { kind: 'ok'; root: PersistedRoot }
  | { kind: 'empty'; root: PersistedRoot }
  | { kind: 'recovery'; root: PersistedRoot; reason: string };

function isThenable<T>(v: T | Promise<T>): v is Promise<T> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Migration hook: bring an older persisted shape up to the current one. Only version 1 exists today. */
function migrate(value: unknown): unknown {
  return value;
}

/** Validates a raw stored string. A failure keeps the raw blob under `splitr-backup-<now>` and never touches the original key. */
export function interpretRaw(raw: string | null, storage: StateStorage, now: string): LoadOutcome | Promise<LoadOutcome> {
  if (raw === null) return { kind: 'empty', root: emptyRoot() };

  let reason: string;
  try {
    const parsed: unknown = migrate(JSON.parse(raw));
    const result = PersistedRootSchema.safeParse(parsed);
    if (result.success) return { kind: 'ok', root: result.data };
    reason = `Stored data failed validation: ${result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')}`;
  } catch (e) {
    reason = `Stored data is not valid JSON: ${errorMessage(e)}`;
  }

  const outcome: LoadOutcome = { kind: 'recovery', root: emptyRoot(), reason };
  try {
    const written = storage.setItem(`${BACKUP_KEY_PREFIX}${now}`, raw);
    if (isThenable(written)) return written.then(() => outcome, () => outcome);
  } catch {
    // The backup copy failed; the original key is still untouched, which is the important part.
  }
  return outcome;
}

/** Reads and validates the stored root. Sync when the storage is sync. Never throws. */
export function loadRoot(storage: StateStorage, now: string): LoadOutcome | Promise<LoadOutcome> {
  const failed = (e: unknown): LoadOutcome => ({
    kind: 'recovery',
    root: emptyRoot(),
    reason: `Could not read stored data: ${errorMessage(e)}`,
  });
  let raw: string | null | Promise<string | null>;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return failed(e);
  }
  if (isThenable(raw)) {
    return raw.then(
      (r) => interpretRaw(r, storage, now),
      (e: unknown) => failed(e),
    );
  }
  return interpretRaw(raw, storage, now);
}

export interface Saver {
  /** Schedule a write of `root` (debounced; written immediately when `delayMs` is 0). */
  schedule(root: PersistedRoot): void;
  /** Write any pending root now. */
  flush(): void;
  /** Drop any pending write (used when the state is reset). */
  cancel(): void;
  /** Write `root` now, unconditionally (used by `confirmRecovery`). */
  writeNow(root: PersistedRoot): void;
}

export function createSaver(
  storage: StateStorage,
  opts: { delayMs: number; onError?: (e: unknown) => void },
): Saver {
  let pending: PersistedRoot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const report = opts.onError ?? ((): void => undefined);

  const write = (root: PersistedRoot): void => {
    try {
      const r = storage.setItem(STORAGE_KEY, JSON.stringify(root));
      if (isThenable(r)) r.catch(report);
    } catch (e) {
      report(e);
    }
  };
  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = (): void => {
    clearTimer();
    if (pending !== null) {
      const root = pending;
      pending = null;
      write(root);
    }
  };
  return {
    schedule(root) {
      pending = root;
      if (opts.delayMs <= 0) {
        flush();
        return;
      }
      clearTimer();
      timer = setTimeout(flush, opts.delayMs);
    },
    flush,
    cancel() {
      clearTimer();
      pending = null;
    },
    writeNow(root) {
      clearTimer();
      pending = null;
      write(root);
    },
  };
}
