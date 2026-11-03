import { Pressable, Text, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import type { Paisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { formatMoney } from '../../lib/format-money';
import { Money } from '../ui';
import { StatePill, type BillStateView } from './StatePill';
import { nameLines } from '../../lib/a11y';

interface BillListRowProps {
  restaurant: string;
  /** Already formatted, e.g. "12 Oct". */
  date: string;
  /** Omit when no trustworthy amount exists (e.g. the calculation is not ok); the amount is then hidden. */
  total?: Paisa;
  state: BillStateView;
  stateDetail?: string;
  onPress: () => void;
  /** Long-press shortcut (e.g. delete); a visible control must also exist. */
  onLongPress?: () => void;
  /** Hide the trailing chevron when another trailing control (e.g. delete) sits beside the row. */
  hideChevron?: boolean;
}

export function BillListRow({ restaurant, date, total, state, stateDetail, onPress, onLongPress, hideChevron }: BillListRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${restaurant}, ${date}, ${total === undefined ? '' : `${formatMoney(total)}, `}${state === 'settled' ? 'Settled' : state.replace('-', ' ')}${stateDetail ? `, ${stateDetail}` : ''}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ minHeight: sizes.minTouch }}
      className="flex-row items-center gap-3 py-3 active:opacity-pressed"
    >
      <View className="flex-1 gap-1">
        <Text numberOfLines={nameLines()} className="font-brico-bold text-item-name text-ink">
          {restaurant}
        </Text>
        <Text className="font-brico-semibold text-meta text-muted">{date}</Text>
        {state === 'settled' ? (
          <View className="flex-row items-center gap-1">
            <Check size={sizes.icon.sm} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="font-brico-semibold text-meta text-muted">Settled</Text>
          </View>
        ) : (
          <StatePill state={state} detail={stateDetail} />
        )}
      </View>
      {total !== undefined ? <Money amount={total} variant="item" /> : null}
      {hideChevron ? null : (
        <ChevronRight size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
      )}
    </Pressable>
  );
}
