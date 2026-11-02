export const motion = {
  duration: { fast: 150, base: 200, slow: 250 },
} as const;

/** Haptics policy (constants only; wiring lives in the mobile app). Light impact only. */
export const haptics = {
  style: 'light',
  on: ['assign', 'settle'],
} as const;

/** Reduced motion: replace transitions with instant changes. */
export const reducedMotionDuration = 0;
