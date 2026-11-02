import { Pressable, Text, View } from 'react-native';
import { Info, X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';

interface NoticeBannerProps {
  count: number;
  onDismiss: () => void;
}

/** "2 payments were reset because amounts changed": icon + text + ink border, never colour alone. */
export function NoticeBanner({ count, onDismiss }: NoticeBannerProps) {
  const { colors } = useTheme();
  const text =
    count === 1 ? '1 payment was reset because amounts changed' : `${count} payments were reset because amounts changed`;
  return (
    <View accessibilityRole="alert" className="flex-row items-center gap-3 rounded-card border-2 border-ink p-3">
      <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      <Text className="flex-1 font-brico-bold text-body-small text-ink">{text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
        onPress={onDismiss}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className="items-center justify-center active:opacity-80"
      >
        <X size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </Pressable>
    </View>
  );
}
