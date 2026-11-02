import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, type AccentName } from './accent';
import { buildPalettes } from './colors';
import { contrastRatio } from './contrast';

const presets = Object.keys(ACCENT_PRESETS) as AccentName[];

describe('contrast helpers', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#D93A16', '#FFF')).toBe(contrastRatio('#FFF', '#D93A16'));
  });
});

for (const accent of presets) {
  const palettes = buildPalettes(accent);
  for (const mode of ['light', 'dark'] as const) {
    const p = palettes[mode];
    describe(`${accent} / ${mode}`, () => {
      const textPairs: [string, string, string][] = [
        ['ink on bg', p.ink, p.bg],
        ['ink on surface', p.ink, p.surface],
        ['ink on surface2', p.ink, p.surface2],
        ['ink on chip', p.ink, p.chip],
        ['muted on bg', p.muted, p.bg],
        ['muted on surface', p.muted, p.surface],
        ['muted on surface2', p.muted, p.surface2],
        ['muted on chip (disabled button label)', p.muted, p.chip],
        ['mutedOnInk on ink', p.mutedOnInk, p.ink],
        ['onAccent on accent', p.onAccent, p.accent],
        ['bg on ink (primary button label)', p.bg, p.ink],
        ['onHero on hero', p.onHero, p.hero],
        ['mutedOnHero on hero', p.mutedOnHero, p.hero],
        ['onHeroButton on heroButton', p.onHeroButton, p.heroButton],
      ];
      for (const [name, fg, bgc] of textPairs) {
        it(`${name} >= 4.5:1`, () => {
          expect(contrastRatio(fg, bgc)).toBeGreaterThanOrEqual(4.5);
        });
      }
      it('heroButton vs hero >= 3:1 (non-text)', () => {
        expect(contrastRatio(p.heroButton, p.hero)).toBeGreaterThanOrEqual(3);
      });
      it('accent vs bg >= 3:1 (non-text)', () => {
        expect(contrastRatio(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
      });
    });
  }
}
