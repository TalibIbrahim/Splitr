/**
 * Tailwind reads design tokens from @splitr/design-tokens (TypeScript source, ESM).
 * Tailwind loads this file with plain Node `require`, which cannot execute TS, so we load the
 * token source through jiti (a runtime TS loader, same one Tailwind 3.4 uses internally).
 * Colours become CSS-variable references (`rgb(var(--ink) / <alpha-value>)`); the actual
 * light/dark values are supplied at runtime by theme/ThemeProvider via NativeWind `vars()`.
 */
const { createJiti } = require('jiti');

const jiti = createJiti(__filename);
const tokens = jiti('../../packages/design-tokens/src/index.ts');
const { tailwindTheme, light, fontFamily } = tokens;

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const colors = Object.fromEntries(
  Object.keys(light).map((k) => [kebab(k), `rgb(var(--${kebab(k)}) / <alpha-value>)`]),
);

// Drop letterSpacing (`em`) from the tailwind fontSize tuples; Money sets it explicitly in px.
const fontSize = Object.fromEntries(
  Object.entries(tailwindTheme.fontSize).map(([k, [size, opts]]) => [
    k,
    [size, { lineHeight: opts.lineHeight }],
  ]),
);

// Prefixed (`font-brico-bold`) so they do not collide with the fontWeight utilities (`font-bold`).
const fontFamilies = Object.fromEntries(
  Object.entries(fontFamily).map(([k, v]) => [`brico-${k}`, v]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: { ...tailwindTheme.borderRadius },
      spacing: { ...tailwindTheme.spacing },
      height: { ...tailwindTheme.height },
      opacity: { ...tailwindTheme.opacity },
      fontSize,
      fontFamily: fontFamilies,
    },
  },
  plugins: [],
};
