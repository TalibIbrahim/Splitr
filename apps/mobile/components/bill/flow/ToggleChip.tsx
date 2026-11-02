import { Pressable, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';

interface ToggleChipProps {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Pill-shaped toggle. On = ink fill + check icon; off = grey. */
export function ToggleChip({ label, on, onPress, accessibilityLabel }: ToggleChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ minHeight: sizes.minTouch }}
      className={`flex-row items-center gap-2 rounded-pill px-4 active:opacity-80 ${on ? 'bg-ink' : 'bg-chip'}`}
    >
      {on ? <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} /> : null}
      <Text className={`text-body ${on ? 'font-brico-extrabold text-bg' : 'font-brico-semibold text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
