import { Pressable, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { Money } from '../ui';

interface BalanceTileProps {
  /** you-owe: money going out. owes-you: money coming in. */
  kind: 'you-owe' | 'owes-you';
  amount: Paisa;
  onPress?: () => void;
}

export function BalanceTile({ kind, amount, onPress }: BalanceTileProps) {
  const { colors } = useTheme();
  const out = kind === 'you-owe';
  const label = out ? 'You owe' : 'owes you';
  const Icon = out ? ArrowUpRight : ArrowDownLeft;

  const body = (
    <>
      <View className="flex-row items-center gap-1">
        <Icon size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        <Text className="font-brico-bold text-body-small text-ink">{label}</Text>
      </View>
      <Money amount={amount} variant="card" muted={amount === 0} />
    </>
  );
  const cls = 'flex-1 gap-1 rounded-card bg-surface-2 p-4';
  const a11y = `${label} ${formatMoney(amount)}`;

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11y} className={cls}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ minHeight: sizes.minTouch }}
      className={`${cls} active:opacity-pressed`}
    >
      {body}
    </Pressable>
  );
}
