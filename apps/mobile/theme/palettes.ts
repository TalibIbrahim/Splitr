import { colors, type Palette } from '@splitr/design-tokens';
import { vars } from 'nativewind';

export type Scheme = 'light' | 'dark';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** '#15131A' -> '21 19 26' (space-separated channels, as `rgb(var(--x) / <alpha-value>)` expects). */
function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function toVars(p: Palette) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[`--${kebab(k)}`] = hexToChannels(v);
  return vars(out);
}

export const themeVars: Record<Scheme, ReturnType<typeof vars>> = {
  light: toVars(colors.light),
  dark: toVars(colors.dark),
};

export const palettes: Record<Scheme, Palette> = { light: colors.light, dark: colors.dark };
