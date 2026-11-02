import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { motion, sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { Money } from '../ui';
import { useReducedMotion } from '../../lib/useReducedMotion';

/** Mirrors phase1-spec §3.1 ExplainLine so bill-domain output can be passed straight through. */
export interface ExplainLineView {
  kind: 'item' | 'items-subtotal' | 'adjustment' | 'exact' | 'rounding' | 'final';
  label: string;
  amount: Paisa;
  context?: string;
}

interface HowYouGotThereProps {
  /** The headline figure, e.g. the rounded share. Shown in the title. */
  total: Paisa;
  lines: readonly ExplainLineView[];
  defaultExpanded?: boolean;
}

const EMPHASISED: ReadonlySet<ExplainLineView['kind']> = new Set(['items-subtotal', 'exact', 'final']);

function titleAmount(total: Paisa): string {
  return formatMoney(total).replace(/^Rs\s*/, '');
}

export function HowYouGotThere({ total, lines, defaultExpanded = false }: HowYouGotThereProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(defaultExpanded);
  const progress = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: motion.duration.base, useNativeDriver: false }).start();
  }, [open, reduced, progress]);

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const title = `How you got to ${titleAmount(total)}`;

  return (
    <View className="rounded-card bg-surface-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${open ? 'collapse' : 'expand'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: sizes.minTouch }}
        className="flex-row items-center justify-between gap-3 p-4 active:opacity-80"
      >
        <Text className="flex-1 font-brico-extrabold text-item-name text-ink">{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View style={{ opacity: progress }} className="px-4 pb-4">
          {lines.map((l, i) => {
            const strong = EMPHASISED.has(l.kind);
            const signed = l.kind === 'adjustment' || l.kind === 'rounding';
            return (
              <View
                key={`${l.kind}-${i}`}
                accessible
                accessibilityLabel={`${l.label}${l.context ? `, ${l.context}` : ''}, ${formatMoney(l.amount, { showSign: signed })}`}
                className={`flex-row items-start justify-between gap-3 py-2 ${
                  strong && i > 0 ? 'mt-1 border-t-2 border-chip' : ''
                }`}
              >
                <View className="flex-1">
                  <Text
                    className={`text-body ${strong ? 'font-brico-extrabold text-ink' : 'font-brico-medium text-ink'}`}
                  >
                    {l.label}
                  </Text>
                  {l.context ? <Text className="font-brico-semibold text-meta text-muted">{l.context}</Text> : null}
                </View>
                <Money amount={l.amount} variant={strong ? 'item' : 'body'} showSign={signed} />
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}
