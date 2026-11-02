import { Text, TextInput, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { fontFamily, sizes, typeScale } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

interface MoneyInputProps {
  /** Raw text as typed. Parsing (parseRupees) happens in bill-domain, not here. */
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}

export function MoneyInput({
  value,
  onChangeText,
  accessibilityLabel,
  placeholder = '0',
  error,
  autoFocus,
  onSubmitEditing,
}: MoneyInputProps) {
  const { colors } = useTheme();
  const t = typeScale.itemName;
  return (
    <View className="gap-1">
      <View
        style={{ minHeight: sizes.minTouch }}
        className={`flex-row items-center gap-2 rounded-button bg-surface-2 px-4 ${
          error ? 'border-2 border-ink' : 'border-2 border-transparent'
        }`}
      >
        <Text className="font-brico-semibold text-body text-muted">Rs</Text>
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          selectionColor={colors.ink}
          textAlign="right"
          style={{
            flex: 1,
            minHeight: sizes.minTouch,
            fontFamily: fontFamily[t.weight],
            fontSize: t.fontSize,
            fontVariant: ['tabular-nums'],
            color: colors.ink,
          }}
        />
      </View>
      {error ? (
        <View className="flex-row items-center gap-1 px-1">
          <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="flex-1 font-brico-bold text-meta text-ink">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
