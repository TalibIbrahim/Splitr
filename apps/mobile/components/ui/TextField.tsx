import { useEffect } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Info } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { announce } from '../../lib/a11y';

interface TextFieldProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  maxLength?: number;
  /** Error text shown under the field; announced and exposed as the input's hint. */
  error?: string;
}

/** Single-line text input on a surface2 fill, at least md button height (grows with font scale), 44pt+ target. */
export function TextField({ value, onChangeText, placeholder, accessibilityLabel, error, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  useEffect(() => {
    if (error) announce(error);
  }, [error]);
  const input = (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={error}
      autoCapitalize="words"
      autoCorrect={false}
      className={`min-h-button-md self-stretch rounded-button bg-surface-2 px-4 py-2 font-brico-medium text-body text-ink ${
        error ? 'border-2 border-ink' : 'border-2 border-transparent'
      }`}
      {...rest}
    />
  );
  if (!error) return input;
  return (
    <View className="gap-1 self-stretch">
      {input}
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-1 px-1">
        <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        <Text className="flex-1 font-brico-bold text-meta text-ink">{error}</Text>
      </View>
    </View>
  );
}
