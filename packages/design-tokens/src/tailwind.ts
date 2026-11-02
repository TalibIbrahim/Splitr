import { light, dark } from './colors';
import { fontFamily, typeScale } from './typography';
import { radii } from './radii';
import { spacing } from './spacing';
import { sizes } from './sizes';
import { opacity } from './opacity';

/**
 * Framework-agnostic data for Tailwind v3 / NativeWind `theme.extend`.
 * Light colours are top-level (`bg-bg`, `text-ink`, `bg-surface-2`); dark ones are prefixed
 * `dark-` (`bg-dark-bg`, `text-dark-ink`, ...) and applied with the `dark:` variant.
 * Mobile wiring is a later task.
 */
function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function toColors(p: Record<string, string>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[`${prefix}${kebab(k)}`] = v;
  return out;
}

const fontSize = Object.fromEntries(
  Object.entries(typeScale).map(([k, s]) => [
    kebab(k),
    [`${s.fontSize}px`, { lineHeight: `${s.lineHeight}px`, letterSpacing: `${s.letterSpacingEm}em` }],
  ]),
);

export const tailwindTheme = {
  colors: { ...toColors({ ...light }), ...toColors({ ...dark }, 'dark-') },
  borderRadius: Object.fromEntries(Object.entries(radii).map(([k, v]) => [kebab(k), `${v}px`])),
  spacing: Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, `${v}px`])),
  height: {
    'button-md': `${sizes.buttonHeight.md}px`,
    'button-lg': `${sizes.buttonHeight.lg}px`,
  },
  opacity: Object.fromEntries(Object.entries(opacity).map(([k, v]) => [k, String(v)])),
  fontFamily: { ...fontFamily },
  fontSize,
} as const;
