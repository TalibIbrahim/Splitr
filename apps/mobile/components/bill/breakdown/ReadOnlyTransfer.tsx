import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { formatMoney } from '../../../lib/format-money';
import { Money } from '../../ui';

interface ReadOnlyTransferProps {
  from: string;
  to: string;
  amount: Paisa;
  paid: boolean;
}

/** A transfer on a settled bill: no toggle, status shown with icon + text. */
export function ReadOnlyTransfer({ from, to, amount, paid }: ReadOnlyTransferProps) {
  const { colors } = useTheme();
  const route = `${from} → ${to}`;
  return (
    <View
      accessible
      accessibilityLabel={`${route}, ${formatMoney(amount)}, ${paid ? 'paid' : 'not paid'}`}
      className="flex-row items-center justify-between gap-3 py-2"
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-brico-bold text-body text-ink">{route}</Text>
        <Money amount={amount} variant="meta" />
      </View>
      {paid ? (
        <View className="flex-row items-center gap-1 rounded-pill bg-chip px-3 py-1">
          <Check size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="font-brico-extrabold text-body-small text-ink">Paid</Text>
        </View>
      ) : null}
    </View>
  );
}
