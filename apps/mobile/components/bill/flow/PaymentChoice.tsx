import { Pressable, Text, View } from 'react-native';
import { Banknote, Check, CreditCard } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { announce } from '../../../lib/a11y';
import { moneyA11yLabel } from '../../../lib/format-money';
import { Money } from '../../ui';

export type PayChoice = 'card' | 'cash';

interface PaymentChoiceProps {
  value: PayChoice;
  onChange: (v: PayChoice) => void;
  totals: Record<PayChoice, Paisa | undefined>;
}

const OPTIONS: { value: PayChoice; label: string; Icon: typeof CreditCard }[] = [
  { value: 'card', label: 'Card', Icon: CreditCard },
  { value: 'cash', label: 'Cash', Icon: Banknote },
];

/** "How did you pay?" Two radio options, each with the receipt's printed total for that way of paying. */
export function PaymentChoice({ value, onChange, totals }: PaymentChoiceProps) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
        How did you pay?
      </Text>
      <Text className="font-brico-medium text-body-small text-muted">
        This receipt prints a card price and a cash price. Pick the one you paid.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="How did you pay" className="flex-row gap-2">
        {OPTIONS.map((o) => {
          const on = o.value === value;
          const total = totals[o.value];
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={`${o.label}${total !== undefined ? `, receipt total ${moneyA11yLabel(total)}` : ''}`}
              accessibilityState={{ checked: on }}
              onPress={() => {
                onChange(o.value);
                announce(`${o.label} selected`);
              }}
              style={{ minHeight: sizes.minTouch }}
              className={`flex-1 gap-1 rounded-button px-3 py-3 active:opacity-pressed ${on ? 'bg-ink' : 'bg-surface-2'}`}
            >
              <View className="flex-row items-center gap-2">
                {on ? (
                  <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} />
                ) : (
                  <o.Icon size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                )}
                <Text className={`text-body ${on ? 'font-brico-extrabold text-bg' : 'font-brico-semibold text-ink'}`}>
                  {o.label}
                </Text>
              </View>
              {total !== undefined ? <Money amount={total} variant="item" onInk={on} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
