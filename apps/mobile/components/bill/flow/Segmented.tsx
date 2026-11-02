import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/** Choice control. Selected = ink fill + check icon + heavier weight (not colour alone). */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{ minHeight: sizes.minTouch }}
            className={`flex-1 flex-row items-center justify-center gap-1 rounded-button px-3 active:opacity-pressed ${
              on ? 'bg-ink' : 'bg-surface-2'
            }`}
          >
            {on ? <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} /> : null}
            <Text
              className={`text-center text-body-small ${on ? 'font-brico-extrabold text-bg' : 'font-brico-medium text-ink'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
