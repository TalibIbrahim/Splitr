import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

export type ButtonVariant = 'primary' | 'outline' | 'onHero';
export type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Accent pill beside the label, e.g. "1 left". */
  badge?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-ink border-2 border-ink',
  outline: 'bg-transparent border-2 border-ink',
  onHero: 'bg-hero-button border-2 border-hero-button',
};
const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-bg',
  outline: 'text-ink',
  onHero: 'text-on-hero-button',
};
const SIZE: Record<ButtonSize, string> = {
  md: 'h-button-md px-5 rounded-button',
  lg: 'h-button-lg px-6 rounded-button-lg',
};

export function Button({
  label,
  onPress,
  accessibilityLabel,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  badge,
  disabled,
  loading,
  fullWidth,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const fg = variant === 'primary' ? colors.bg : variant === 'outline' ? colors.ink : colors.onHeroButton;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
      className={`flex-row items-center justify-center gap-2 active:opacity-80 ${CONTAINER[variant]} ${SIZE[size]} ${
        fullWidth ? 'self-stretch' : 'self-start'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : Icon ? (
        <Icon size={sizes.icon.md} color={fg} strokeWidth={sizes.icon.strokeWidth} />
      ) : null}
      <Text className={`font-brico-bold text-item-name ${LABEL[variant]}`}>{label}</Text>
      {badge ? (
        <View className="rounded-pill bg-accent px-2 py-0.5">
          <Text className="font-brico-extrabold text-meta text-on-accent">{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
