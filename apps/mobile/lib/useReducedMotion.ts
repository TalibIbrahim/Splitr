import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Module-level cache so the first render is already correct. Until the OS answers we assume reduced
// (safe default: no animation flash for users who asked for none).
let cached = true;
const listeners = new Set<(v: boolean) => void>();

function set(v: boolean) {
  cached = v;
  listeners.forEach((l) => l(v));
}

AccessibilityInfo.isReduceMotionEnabled()
  .then(set)
  .catch(() => set(false));
AccessibilityInfo.addEventListener('reduceMotionChanged', set);

/** Current known value (true until the OS has answered). */
export function getReducedMotion(): boolean {
  return cached;
}

/** True when the OS asks for reduced motion; transitions must then be instant. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(cached);
  useEffect(() => {
    listeners.add(setReduced);
    setReduced(cached);
    return () => {
      listeners.delete(setReduced);
    };
  }, []);
  return reduced;
}
