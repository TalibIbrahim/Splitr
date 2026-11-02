/** Opacity tokens. Never write a literal opacity for a scrim, disabled or pressed state. */
export const opacity = {
  /** Dimmed backdrop behind a modal sheet (ink at this opacity). */
  scrim: 0.4,
  /** Disabled controls. */
  disabled: 0.4,
  /** Pressed feedback on touchables. */
  pressed: 0.8,
} as const;
