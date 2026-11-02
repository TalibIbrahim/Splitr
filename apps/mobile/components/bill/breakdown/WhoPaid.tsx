import { Pressable, Text, View } from 'react-native';
import { Check, Split } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { Money } from '../../ui';

export interface PayerChip {
  id: string;
  name: string;
  isMe: boolean;
  paid: boolean;
}

interface WhoPaidProps {
  payers: readonly PayerChip[];
  /** Contribution amounts for the people who paid, for the multi-payer summary. */
  paidAmounts: readonly { id: string; name: string; amount: Paisa }[];
  onPick: (id: string) => void;
  onSplit: () => void;
}

export function WhoPaid({ payers, paidAmounts, onPick, onSplit }: WhoPaidProps) {
  const { colors } = useTheme();
  const nobody = paidAmounts.length === 0;
  return (
    <View className="gap-3">
      <Text className="font-brico-extrabold text-item-name text-ink">{nobody ? 'Who paid the bill?' : 'Who paid?'}</Text>
      {nobody ? (
        <Text className="font-brico-medium text-body-small text-muted">
          Pick the person who put it on their card or paid cash.
        </Text>
      ) : paidAmounts.length > 1 ? (
        <View className="gap-1">
          {paidAmounts.map((p) => (
            <View key={p.id} className="flex-row items-center justify-between">
              <Text className="font-brico-medium text-body-small text-ink">{p.name}</Text>
              <Money amount={p.amount} variant="body" />
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {payers.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${p.isMe ? 'You' : p.name} paid the bill`}
            accessibilityState={{ selected: p.paid }}
            onPress={() => onPick(p.id)}
            style={{ minHeight: sizes.minTouch }}
            className={`flex-row items-center gap-1 rounded-pill border-2 px-4 active:opacity-80 ${
              p.isMe ? 'bg-accent' : 'bg-chip'
            } ${p.paid ? 'border-ink' : 'border-transparent'}`}
          >
            {p.paid ? (
              <Check
                size={sizes.icon.sm}
                color={p.isMe ? colors.onAccent : colors.ink}
                strokeWidth={sizes.icon.strokeWidth}
              />
            ) : null}
            <Text
              className={`text-body-small ${p.paid ? 'font-brico-extrabold' : 'font-brico-semibold'} ${
                p.isMe ? 'text-on-accent' : 'text-ink'
              }`}
            >
              {p.isMe ? 'You' : p.name}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Split payment between several people"
          onPress={onSplit}
          style={{ minHeight: sizes.minTouch }}
          className="flex-row items-center gap-1 rounded-pill border-2 border-dashed border-ink px-4 active:opacity-80"
        >
          <Split size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="font-brico-bold text-body-small text-ink">Split payment</Text>
        </Pressable>
      </View>
    </View>
  );
}
