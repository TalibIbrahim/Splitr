import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../theme';
import { announce, useDismissDelay } from '../../lib/a11y';

interface SnackbarProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  /** Auto-dismiss delay; default 5000 ms. */
  durationMs?: number;
}

/** Ink bar pinned to the bottom of its screen: icon + text + one action. */
export function Snackbar({ message, actionLabel, onAction, onDismiss, durationMs = 5000 }: SnackbarProps) {
  const { colors } = useTheme();
  const delay = useDismissDelay(durationMs);
  useEffect(() => {
    announce(message);
  }, [message]);
  useEffect(() => {
    const t = setTimeout(onDismiss, delay);
    return () => clearTimeout(t);
  }, [message, delay, onDismiss]);

  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute bottom-4 left-4 right-4 flex-row items-center gap-3 rounded-button bg-ink pl-4"
    >
      <Trash2 size={sizes.icon.md} color={colors.bg} strokeWidth={sizes.icon.strokeWidth} />
      <Text className="flex-1 font-brico-bold text-body-small text-bg">{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${message}`}
        onPress={onAction}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className="items-center justify-center px-4 active:opacity-pressed"
      >
        <Text className="font-brico-extrabold text-body text-bg">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
