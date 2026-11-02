import { ACTIVE_ACCENT, accentFor, type AccentName } from './accent';

export interface Palette {
  /** Primary text, primary button fill. In dark mode this is the light tone. */
  ink: string;
  /** Screen background. Also the text colour placed ON ink (primary button labels). Hero card text uses `onHero`. */
  bg: string;
  surface: string;
  surface2: string;
  chip: string;
  /** Secondary text on bg / surface / surface2 / chip. */
  muted: string;
  /** Secondary text on an ink-filled element. */
  mutedOnInk: string;
  accent: string;
  onAccent: string;
  /** Group hero card fill (stays dark in dark mode: user decision). */
  hero: string;
  /** Text on hero. */
  onHero: string;
  /** Secondary text on hero. */
  mutedOnHero: string;
  /** Fill of the button on the hero card ("Scan tonight's bill"). */
  heroButton: string;
  /** Label on heroButton. */
  onHeroButton: string;
}

const lightBase = {
  ink: '#15131A',
  bg: '#FFFFFF',
  surface: '#F6F5F8',
  surface2: '#F4F3F6',
  chip: '#EEECF1',
  muted: '#625E6B',
  mutedOnInk: '#B8B3C2',
  onAccent: '#FFFFFF',
  hero: '#15131A',
  onHero: '#FFFFFF',
  mutedOnHero: '#B8B3C2',
  heroButton: '#FFFFFF',
  onHeroButton: '#15131A',
} as const;

/**
 * Dark mapping: "ink" keeps its role as the primary-contrast tone, so it flips to #F4F3F6
 * (primary text, primary buttons are light fills on the dark bg). Text placed on
 * ink is `bg` (#0F0E12). mutedOnInk therefore must be a mid-dark grey: it reuses #625E6B.
 */
const darkBase = {
  ink: '#F4F3F6',
  bg: '#0F0E12',
  surface: '#1A1820',
  surface2: '#23212A',
  chip: '#2C2A33',
  muted: '#A6A1AF',
  mutedOnInk: '#625E6B',
  onAccent: '#FFFFFF',
  hero: '#34313D',
  onHero: '#F4F3F6',
  mutedOnHero: '#A6A1AF',
  heroButton: '#F4F3F6',
  onHeroButton: '#0F0E12',
} as const;

export function buildPalettes(accent: AccentName): { light: Palette; dark: Palette } {
  const a = accentFor(accent);
  return {
    light: { ...lightBase, accent: a.light },
    dark: { ...darkBase, accent: a.dark },
  };
}

const active = buildPalettes(ACTIVE_ACCENT);
export const light: Palette = active.light;
export const dark: Palette = active.dark;
export const colors = { light, dark } as const;
