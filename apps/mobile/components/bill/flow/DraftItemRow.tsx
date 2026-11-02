import { Pressable, Text, View } from 'react-native';
import { Info, Trash2 } from 'lucide-react-native';
import { parseRupees } from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { Card } from '../../ui';
import { AmountField, Field } from './Field';
import { QtyControl } from './QtyControl';
import { needsCheck, rowReasons, type DraftRow } from './draftRows';
import { rupeesErrorText } from './messages';

interface DraftItemRowProps {
  row: DraftRow;
  onChange: (patch: Partial<Pick<DraftRow, 'name' | 'qty' | 'amount'>>) => void;
  onDelete: () => void;
}

/** One editable scanned line. Low-confidence rows get an ink border, an Info icon and the reasons in words. */
export function DraftItemRow({ row, onChange, onDelete }: DraftItemRowProps) {
  const { colors } = useTheme();
  const low = needsCheck(row);
  const reasons = rowReasons(row);
  const amount = parseRupees(row.amount);
  const label = row.name.trim() || 'new item';
  return (
    <Card tone="surface2" className={`gap-3 ${low ? 'border-2 border-ink' : 'border-2 border-transparent'}`}>
      {low ? (
        <View className="flex-row items-start gap-2 pr-1">
          <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="flex-1 font-brico-bold text-body-small text-ink">
            {reasons.length > 0 ? `Check this: ${reasons.join(', ')}` : 'Check this'}
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-start gap-2">
        <Field
          accessibilityLabel={`Name of ${label}`}
          placeholder="Item name"
          value={row.name}
          onChangeText={(t) => onChange({ name: t })}
          autoCapitalize="words"
          error={row.name.trim().length === 0 ? 'Give the item a name' : undefined}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label}`}
          onPress={onDelete}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center active:opacity-pressed"
        >
          <Trash2 size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
      </View>
      <View className="flex-row items-start gap-2">
        <QtyControl value={row.qty} onChange={(t) => onChange({ qty: t })} subject={label} />
        <AmountField
          accessibilityLabel={`Line total of ${label} in rupees`}
          placeholder="0"
          value={row.amount}
          onChangeText={(t) => onChange({ amount: t })}
          error={!amount.ok ? rupeesErrorText(amount.reason) : undefined}
        />
      </View>
    </Card>
  );
}
