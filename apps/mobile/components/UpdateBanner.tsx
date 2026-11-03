import { Linking, Pressable, Text } from 'react-native';
import Constants from 'expo-constants';
import { Info, X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { selectUpdateBanner, splitrStore, useSplitr } from '../store';
import { Card } from './ui';
import { useTheme } from '../theme';
import { isTrustedReleaseUrl } from '../lib/update-check';

/** D36. Shows when a newer release is known; tap opens the release page, X dismisses that version. */
export function UpdateBanner() {
  const { colors } = useTheme();
  const current = Constants.expoConfig?.version ?? '0.0.0';
  const update = useSplitr(selectUpdateBanner(current));
  if (!update) return null;

  const open = (): void => {
    if (isTrustedReleaseUrl(update.url)) void Linking.openURL(update.url);
  };

  return (
    <Card tone="surface2" className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Update available: version ${update.version}. Opens the release page`}
        onPress={open}
        style={{ minHeight: sizes.minTouch }}
        className="flex-1 flex-row items-center gap-2 active:opacity-pressed"
      >
        <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        <Text className="flex-1 font-brico-bold text-body-small text-ink">
          Update available: v{update.version}. Tap to open
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss update notice for version ${update.version}`}
        onPress={() => splitrStore.getState().dismissUpdate(update.version)}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className="-my-2 -mr-2 items-center justify-center active:opacity-pressed"
      >
        <X size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </Pressable>
    </Card>
  );
}
