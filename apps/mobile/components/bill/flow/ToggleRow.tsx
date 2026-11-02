import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';

interface ToggleRowProps {
  title: string;
  subtitle?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Controls shown under the row while it is on. */
  children?: ReactNode;
}

/** Charge row: tap anywhere on the header to switch on/off. On = ink pill with check + "On" text. */
export function ToggleRow({ title, subtitle, on, onChange, children }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <View className="gap-3 rounded-card bg-surface-2 p-4">
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ''}`}
        accessibilityState={{ checked: on }}
        onPress={() => onChange(!on)}
        style={{ minHeight: sizes.minTouch }}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <View className="flex-1">
          <Text className="font-brico-extrabold text-item-name text-ink">{title}</Text>
          {subtitle ? <Text className="font-brico-medium text-body-small text-muted">{subtitle}</Text> : null}
        </View>
        <View
          className={`flex-row items-center gap-1 rounded-pill px-3 py-2 ${on ? 'bg-ink' : 'bg-chip'}`}
        >
          {on ? <Check size={sizes.icon.sm} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} /> : null}
          <Text className={`text-body-small ${on ? 'font-brico-extrabold text-bg' : 'font-brico-semibold text-ink'}`}>
            {on ? 'On' : 'Off'}
          </Text>
        </View>
      </Pressable>
      {on ? children : null}
    </View>
  );
}
