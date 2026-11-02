/**
 * The ONE place the accent colour is configured.
 * Change ACTIVE_ACCENT to try another preset; nothing else needs editing.
 * White text (onAccent) must stay >= 4.5:1 on the accent in both themes (enforced by contrast.test.ts).
 */
export const ACCENT_PRESETS = {
  ember: '#D93A16',
  cobalt: '#2B50E0',
  green: '#13795B',
} as const;

export type AccentName = keyof typeof ACCENT_PRESETS;

export const ACTIVE_ACCENT: AccentName = 'ember';

/**
 * Dark-mode accent per preset. Kept equal to the light value: white text on the accent must stay
 * >= 4.5:1 (lightening would break it) and each preset already clears 3:1 against the dark bg.
 */
export const ACCENT_DARK_VARIANTS: Record<AccentName, string> = {
  ember: ACCENT_PRESETS.ember,
  cobalt: ACCENT_PRESETS.cobalt,
  green: ACCENT_PRESETS.green,
};

export function accentFor(name: AccentName): { light: string; dark: string } {
  return { light: ACCENT_PRESETS[name], dark: ACCENT_DARK_VARIANTS[name] };
}
