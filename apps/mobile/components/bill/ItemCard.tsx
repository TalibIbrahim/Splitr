import { Pressable, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { Money, Pill } from '../ui';

export interface ItemAssignee {
  id: string;
  name: string;
  isCurrentUser?: boolean;
}

interface ItemCardProps {
  name: string;
  qty: number;
  lineTotal: Paisa;
  assignees: readonly ItemAssignee[];
  /** Per-person amount for shared items ("800 each"). */
  each?: Paisa;
  /** ok: normal. unassigned: dashed + claim prompt. mismatch: split under/over-assigned. */
  status?: 'ok' | 'unassigned' | 'mismatch';
  onPress?: () => void;
  onLongPress?: () => void;
}

export function ItemCard({
  name,
  qty,
  lineTotal,
  assignees,
  each,
  status = 'ok',
  onPress,
  onLongPress,
}: ItemCardProps) {
  const { colors } = useTheme();
  const border =
    status === 'unassigned'
      ? 'border-2 border-dashed border-ink'
      : status === 'mismatch'
        ? 'border-2 border-ink'
        : 'border-2 border-transparent';

  const summary = [
    qty > 1 ? `${name}, ${qty} times` : name,
    formatMoney(lineTotal),
    status === 'unassigned'
      ? 'not assigned yet, tap to claim'
      : status === 'mismatch'
        ? "split doesn't add up"
        : assignees.length
          ? `assigned to ${assignees.map((a) => (a.isCurrentUser ? 'you' : a.name)).join(', ')}`
          : '',
    each !== undefined ? `${formatMoney(each)} each` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ minHeight: sizes.minTouch }}
      className={`gap-2 rounded-card bg-bg p-4 active:opacity-80 ${border}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-brico-bold text-item-name text-ink">{name}</Text>
        <View className="flex-row items-baseline gap-1">
          {qty > 1 ? <Text className="font-brico-semibold text-meta text-muted">{qty} ×</Text> : null}
          <Money amount={lineTotal} variant="item" />
        </View>
      </View>

      {status === 'unassigned' ? (
        <View className="flex-row items-center gap-2">
          <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="flex-1 font-brico-bold text-body-small text-ink">
            Whose {name}? Tap to claim
          </Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap items-center gap-2">
          {assignees.map((a) => (
            <Pill
              key={a.id}
              tone={a.isCurrentUser ? 'accent' : 'chip'}
              label={a.isCurrentUser ? 'You' : a.name}
            />
          ))}
          {each !== undefined ? (
            <View className="flex-row items-baseline gap-1">
              <Money amount={each} variant="meta" />
              <Text className="font-brico-semibold text-meta text-muted">each</Text>
            </View>
          ) : null}
        </View>
      )}

      {status === 'mismatch' ? (
        <View className="flex-row items-center gap-2">
          <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="flex-1 font-brico-bold text-body-small text-ink">Split doesn't add up</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
