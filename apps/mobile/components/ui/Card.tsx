import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

export type CardTone = 'surface2' | 'accent' | 'hero' | 'item';

const TONE: Record<CardTone, string> = {
  surface2: 'bg-surface-2',
  accent: 'bg-accent',
  hero: 'bg-hero',
  item: 'bg-bg',
};

type CardProps = {
  tone?: CardTone;
  /** Unassigned item: dashed ink border + info icon. */
  dashed?: boolean;
  children?: ReactNode;
  className?: string;
} & (
  | { onPress?: undefined; accessibilityLabel?: string }
  | { onPress: () => void; accessibilityLabel: string }
);

export function Card({ tone = 'surface2', dashed, children, className, onPress, accessibilityLabel }: CardProps) {
  const { colors } = useTheme();
  const base = `p-4 ${tone === 'hero' ? 'rounded-hero' : 'rounded-card'} ${TONE[tone]} ${
    dashed ? 'border-2 border-dashed border-ink' : ''
  } ${className ?? ''}`;

  const inner = (
    <>
      {children}
      {dashed ? (
        <View className="absolute right-3 top-3">
          <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={{ minHeight: sizes.minTouch }}
        className={`${base} active:opacity-pressed`}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessibilityLabel={accessibilityLabel} className={base}>
      {inner}
    </View>
  );
}
