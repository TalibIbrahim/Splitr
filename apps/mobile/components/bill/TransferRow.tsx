import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { announce } from '../../lib/a11y';
import { Money } from '../ui';

interface TransferRowProps {
  from: string;
  to: string;
  amount: Paisa;
  paid: boolean;
  onTogglePaid: () => void;
}

export function TransferRow({ from, to, amount, paid, onTogglePaid }: TransferRowProps) {
  const { colors } = useTheme();
  const route = `${from} → ${to}`;

  return (
    <View className="flex-row items-center justify-between gap-3 py-2">
      <View className="flex-1 gap-0.5">
        <Text className="font-brico-bold text-body text-ink">{route}</Text>
        <Money amount={amount} variant="meta" />
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${route}, ${formatMoney(amount)}, ${paid ? 'paid. Tap to undo' : 'not paid. Mark paid'}`}
        accessibilityState={{ checked: paid }}
        onPress={() => {
          announce(paid ? 'Marked unpaid' : `Marked ${from} → ${to} paid`);
          onTogglePaid();
        }}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className={`flex-row items-center justify-center gap-1 rounded-pill px-4 active:opacity-pressed ${
          paid ? 'bg-chip' : 'border-2 border-ink'
        }`}
      >
        {paid ? <Check size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} /> : null}
        <Text className={`text-body-small text-ink ${paid ? 'font-brico-extrabold' : 'font-brico-bold'}`}>
          {paid ? 'Paid' : 'Mark paid'}
        </Text>
      </Pressable>
    </View>
  );
}
