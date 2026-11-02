import { Pressable, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { parseQty } from '../../../lib/sums';
import { Field } from './Field';

interface QtyControlProps {
  /** Raw text of the quantity box (digits). */
  value: string;
  onChange: (text: string) => void;
  /** Used in accessibility labels, e.g. "Chicken Karahi". */
  subject?: string;
  onSubmitEditing?: () => void;
}

/** Quantity: stepper buttons around a number box you can also type into. */
export function QtyControl({ value, onChange, subject, onSubmitEditing }: QtyControlProps) {
  const { colors } = useTheme();
  const n = parseQty(value) ?? 1;
  const of = subject ? ` of ${subject}` : '';
  const btn = 'items-center justify-center rounded-button bg-surface-2 active:opacity-80';
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease quantity${of}`}
        onPress={() => onChange(String(Math.max(1, n - 1)))}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className={btn}
      >
        <Minus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </Pressable>
      <View style={{ width: 64 }}>
        <Field
          compact
          accessibilityLabel={`Quantity${of}`}
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
          align="center"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={3}
          selectTextOnFocus
          onSubmitEditing={onSubmitEditing}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity${of}`}
        onPress={() => onChange(String(Math.min(999, n + 1)))}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className={btn}
      >
        <Plus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </Pressable>
    </View>
  );
}
