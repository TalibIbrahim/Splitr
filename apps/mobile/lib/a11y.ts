import { useEffect, useState } from 'react';
import { AccessibilityInfo, PixelRatio } from 'react-native';

/** Speak `msg` through the active screen reader (no-op when none is running). */
export function announce(msg: string): void {
  if (!msg) return;
  try {
    AccessibilityInfo.announceForAccessibility(msg);
  } catch {
    // announcing is best effort
  }
}

/** True while TalkBack / VoiceOver is on. */
export function useScreenReaderEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** Auto-dismiss delay: 15 s with a screen reader on, otherwise `baseMs`. */
export function useDismissDelay(baseMs: number): number {
  const sr = useScreenReaderEnabled();
  return sr ? Math.max(baseMs, 15000) : baseMs;
}

/** Lines a name beside money may use: 2 at large font scale (never truncate who owes what), else 1. */
export function nameLines(): number {
  return PixelRatio.getFontScale() > 1.3 ? 2 : 1;
}
