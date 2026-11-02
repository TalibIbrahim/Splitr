import { Pressable, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Selected = ink fill + check icon + extra-bold; unselected = chip fill + medium weight (never colour alone). */
export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} filter`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: sizes.minTouch }}
      className={`flex-row items-center gap-1 rounded-pill px-4 active:opacity-80 ${selected ? 'bg-ink' : 'bg-chip'}`}
    >
      {selected ? <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} /> : null}
      <Text
        className={`text-body-small ${selected ? 'font-brico-extrabold text-bg' : 'font-brico-medium text-ink'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
