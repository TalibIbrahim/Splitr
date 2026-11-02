import type { Ref } from 'react';
import { Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { Info } from 'lucide-react-native';
import { fontFamily, sizes, typeScale } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';

interface FieldProps
  extends Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'autoFocus'
    | 'keyboardType'
    | 'inputMode'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'blurOnSubmit'
    | 'autoCapitalize'
    | 'autoCorrect'
    | 'maxLength'
    | 'selectTextOnFocus'
    | 'onBlur'
  > {
  accessibilityLabel: string;
  /** Static text inside the box before the input, e.g. "Rs". */
  prefix?: string;
  /** Static text inside the box after the input, e.g. "%". */
  suffix?: string;
  align?: 'left' | 'right' | 'center';
  error?: string;
  inputRef?: Ref<TextInputInstance>;
  /** Fixed width instead of filling the row (qty box). */
  compact?: boolean;
}

/** Token-styled single-line input (same look as MoneyInput) with ref, submit and prefix/suffix support. */
export function Field({
  accessibilityLabel,
  prefix,
  suffix,
  align = 'left',
  error,
  inputRef,
  compact,
  ...input
}: FieldProps) {
  const { colors } = useTheme();
  const t = typeScale.itemName;
  return (
    <View className={compact ? 'gap-1' : 'flex-1 gap-1'}>
      <View
        style={{ minHeight: sizes.minTouch }}
        className={`flex-row items-center gap-2 rounded-button bg-surface-2 px-4 ${
          error ? 'border-2 border-ink' : 'border-2 border-transparent'
        }`}
      >
        {prefix ? <Text className="font-brico-semibold text-body text-muted">{prefix}</Text> : null}
        <TextInput
          ref={inputRef}
          accessibilityLabel={accessibilityLabel}
          placeholderTextColor={colors.muted}
          selectionColor={colors.ink}
          textAlign={align}
          {...input}
          style={{
            flex: 1,
            minWidth: compact ? sizes.minTouch : undefined,
            minHeight: sizes.minTouch,
            fontFamily: fontFamily[t.weight],
            fontSize: t.fontSize,
            fontVariant: ['tabular-nums'],
            color: colors.ink,
          }}
        />
        {suffix ? <Text className="font-brico-semibold text-body text-muted">{suffix}</Text> : null}
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

/** Decimal rupee input. Parsing is done by the caller with parseRupees. */
export function AmountField(props: Omit<FieldProps, 'prefix' | 'keyboardType' | 'inputMode' | 'align'>) {
  return <Field prefix="Rs" align="right" keyboardType="decimal-pad" inputMode="decimal" {...props} />;
}

/** Decimal percent input. Parsing is done by the caller with parsePercentToBp. */
export function PercentField(props: Omit<FieldProps, 'suffix' | 'keyboardType' | 'inputMode' | 'align'>) {
  return <Field suffix="%" align="right" keyboardType="decimal-pad" inputMode="decimal" {...props} />;
}
