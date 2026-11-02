import { Pressable, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, Check, type LucideIcon } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { Money } from '../ui';

/** owes: they owe (someone else). paid: already settled up. owe: I owe (my card). */
export type PersonTag = 'owes' | 'paid' | 'owe';

const TAG: Record<PersonTag, { icon: LucideIcon; label: string }> = {
  owes: { icon: ArrowDownLeft, label: 'owes' },
  paid: { icon: Check, label: 'paid' },
  owe: { icon: ArrowUpRight, label: 'owe' },
};

interface PersonCardProps {
  name: string;
  amount: Paisa;
  tag: PersonTag;
  isMe?: boolean;
  selected?: boolean;
  onPress: () => void;
}

export function PersonCard({ name, amount, tag, isMe, selected, onPress }: PersonCardProps) {
  const { colors } = useTheme();
  const { icon: TagIcon, label } = TAG[tag];
  const fg = isMe ? colors.onAccent : colors.ink;
  const text = isMe ? 'text-on-accent' : 'text-ink';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isMe ? 'You' : name} ${label} ${formatMoney(amount)}`}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{ minHeight: sizes.minTouch }}
      className={`gap-1 rounded-card border-2 p-4 active:opacity-pressed ${isMe ? 'bg-accent' : 'bg-surface-2'} ${
        selected ? 'border-ink' : 'border-transparent'
      }`}
    >
      <Text numberOfLines={1} className={`font-brico-bold text-body-small ${text}`}>
        {isMe ? 'You' : name}
      </Text>
      <Money amount={amount} variant="card" onAccent={isMe} />
      <View className="flex-row items-center gap-1">
        <TagIcon size={sizes.icon.sm} color={fg} strokeWidth={sizes.icon.strokeWidth} />
        <Text className={`font-brico-bold text-meta ${text}`}>{label}</Text>
      </View>
    </Pressable>
  );
}
