import { useEffect, useRef } from 'react';
import { Animated, Platform, type TextStyle } from 'react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { fontFamily, letterSpacingPx, motion, typeScale, type TypeStyleName } from '@splitr/design-tokens';
import { formatMoney, moneyA11yLabel } from '../../lib/format-money';
import { useReducedMotion } from '../../lib/useReducedMotion';

export type MoneyVariant = 'hero' | 'card' | 'item' | 'body' | 'meta';

const VARIANT_STYLE: Record<MoneyVariant, TypeStyleName> = {
  hero: 'heroAmount',
  card: 'cardAmount',
  item: 'itemName',
  body: 'body',
  meta: 'meta',
};

interface MoneyProps {
  amount: Paisa;
  variant?: MoneyVariant;
  /** Prefix positive amounts with "+" (negatives always show a minus). */
  showSign?: boolean;
  /** Amount sits on an ink fill: use the on-ink text colours. */
  onInk?: boolean;
  /** Amount sits on the hero card: use the on-hero text colours. */
  onHero?: boolean;
  /** Amount sits on the accent fill (the current user's card). */
  onAccent?: boolean;
  className?: string;
}

function colorClass(variant: MoneyVariant, onInk?: boolean, onHero?: boolean, onAccent?: boolean): string {
  if (onAccent) return 'text-on-accent';
  if (onHero) return variant === 'meta' ? 'text-muted-on-hero' : 'text-on-hero';
  if (onInk) return variant === 'meta' ? 'text-muted-on-ink' : 'text-bg';
  return variant === 'meta' ? 'text-muted' : 'text-ink';
}

export function Money({ amount, variant = 'body', showSign, onInk, onHero, onAccent, className }: MoneyProps) {
  const t = typeScale[VARIANT_STYLE[variant]];
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const prev = useRef(amount);

  // Animate total changes (fade-in, 200ms); instant when reduced motion is on.
  useEffect(() => {
    if (prev.current === amount) return;
    prev.current = amount;
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.25);
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.base,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [amount, reduced, opacity]);

  const style: TextStyle = {
    fontFamily: fontFamily[t.weight],
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    letterSpacing: letterSpacingPx(t),
    fontVariant: ['tabular-nums'],
  };

  return (
    <Animated.Text
      accessibilityLabel={moneyA11yLabel(amount)}
      accessibilityRole="text"
      className={`${colorClass(variant, onInk, onHero, onAccent)} ${className ?? ''}`}
      style={[style, { opacity }]}
    >
      {formatMoney(amount, { showSign })}
    </Animated.Text>
  );
}
