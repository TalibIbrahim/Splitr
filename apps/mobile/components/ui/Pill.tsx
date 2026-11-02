import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';

type PillProps =
  | { tone: 'chip' | 'accent'; label: string; icon?: LucideIcon }
  /** Status without colour: grey pill + icon + bold text. Icon is required. */
  | { tone: 'status'; label: string; icon: LucideIcon };

export function Pill(props: PillProps) {
  const { colors } = useTheme();
  const { tone, label, icon: Icon } = props;
  const accent = tone === 'accent';
  const fg = accent ? colors.onAccent : colors.ink;

  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`flex-row items-center gap-1 self-start rounded-pill px-3 py-1 ${
        accent ? 'bg-accent' : 'bg-chip'
      }`}
    >
      {Icon ? <Icon size={sizes.icon.sm} color={fg} strokeWidth={sizes.icon.strokeWidth} /> : null}
      <Text
        className={`text-body-small ${tone === 'status' ? 'font-brico-bold' : 'font-brico-semibold'} ${
          accent ? 'text-on-accent' : 'text-ink'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
