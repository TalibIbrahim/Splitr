/**
 * Web-only stand-in for `expo-sqlite/kv-store` (the published expo-sqlite web build ships without its wasm
 * binaries). Same synchronous API subset the store uses, backed by localStorage; in-memory when it is unavailable.
 * Native builds never load this file (see metro.config.js).
 */
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const Storage = {
  getItemSync(key: string): string | null {
    const s = ls();
    try {
      return s ? s.getItem(key) : (memory.get(key) ?? null);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItemSync(key: string, value: string): void {
    const s = ls();
    try {
      if (s) s.setItem(key, value);
      else memory.set(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItemSync(key: string): boolean {
    const s = ls();
    try {
      if (s) s.removeItem(key);
      else memory.delete(key);
    } catch {
      memory.delete(key);
    }
    return true;
  },
};

export default Storage;
