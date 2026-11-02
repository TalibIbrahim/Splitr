/** Font family names exactly as exported by @expo-google-fonts/bricolage-grotesque (v0.4.x). */
export const fontFamily = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  extrabold: 'BricolageGrotesque_800ExtraBold',
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  weight: keyof typeof fontFamily;
  /** Letter spacing as a fraction of font size (em). -0.045 = -4.5%. */
  letterSpacingEm: number;
}

export const lineHeights = {
  tight: 1.0,
  snug: 1.15,
  normal: 1.3,
} as const;

export const typeScale = {
  heroAmount: { fontSize: 56, lineHeight: 60, weight: 'extrabold', letterSpacingEm: -0.045 },
  screenTitle: { fontSize: 22, lineHeight: 28, weight: 'extrabold', letterSpacingEm: 0 },
  cardAmount: { fontSize: 30, lineHeight: 34, weight: 'extrabold', letterSpacingEm: 0 },
  itemName: { fontSize: 16, lineHeight: 22, weight: 'bold', letterSpacingEm: 0 },
  body: { fontSize: 15, lineHeight: 21, weight: 'medium', letterSpacingEm: 0 },
  bodySmall: { fontSize: 14, lineHeight: 20, weight: 'medium', letterSpacingEm: 0 },
  meta: { fontSize: 13, lineHeight: 18, weight: 'semibold', letterSpacingEm: 0 },
} as const satisfies Record<string, TypeStyle>;

export type TypeStyleName = keyof typeof typeScale;

/** Allowed range for cardAmount per spec (28-32). */
export const cardAmountRange = { min: 28, max: 32 } as const;

/** Letter spacing in px (React Native `letterSpacing` is in px). */
export function letterSpacingPx(style: Pick<TypeStyle, 'fontSize' | 'letterSpacingEm'>): number {
  return Math.round(style.fontSize * style.letterSpacingEm * 100) / 100;
}
