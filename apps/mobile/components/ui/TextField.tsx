import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';

interface TextFieldProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  maxLength?: number;
}

/** Single-line text input on a surface2 fill, md button height, 44pt+ target. */
export function TextField({ value, onChangeText, placeholder, accessibilityLabel, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="words"
      autoCorrect={false}
      className="h-button-md self-stretch rounded-button bg-surface-2 px-4 font-brico-medium text-body text-ink"
      {...rest}
    />
  );
}
