import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Camera, CameraOff, ScanLine, TriangleAlert } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { Button } from '../../ui';
import type { ScanMode, ScanState } from './useReceiptScan';

interface ScanStatusProps {
  state: Exclude<ScanState, { kind: 'idle' }>;
  onRetry: () => void;
  onTypeItIn: () => void;
  onStart: (mode: ScanMode) => void;
  /** Leave the status screen and go back to where the scan started. */
  onBack: () => void;
}

/** Full-screen processing and problem states for the receipt scan. Icon + text always, never colour alone. */
export function ScanStatus({ state, onRetry, onTypeItIn, onStart, onBack }: ScanStatusProps) {
  const { colors } = useTheme();

  if (state.kind === 'working') {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Reading the receipt"
        className="flex-1 items-center justify-center gap-4 bg-bg px-6"
      >
        <ActivityIndicator size="large" color={colors.ink} />
        <Text className="text-center font-brico-extrabold text-screen-title text-ink">Reading the receipt…</Text>
        <Text className="text-center font-brico-medium text-body text-muted">
          This happens on your phone. Nothing is uploaded.
        </Text>
      </View>
    );
  }

  const copy = {
    failed: {
      Icon: TriangleAlert,
      title: "Couldn't read this photo",
      body: 'Try again with the whole receipt in view, flat and well lit, or type the items in.',
    },
    unavailable: {
      Icon: ScanLine,
      title: "The scanner isn't available here",
      body: 'This phone cannot run the document scanner. You can take a photo with the camera or choose one from your library.',
    },
    permission: {
      Icon: CameraOff,
      title: 'Camera access is off',
      body: 'Splitr uses the camera only to photograph the receipt, and the photo stays on this phone. You can turn the camera on in Settings, or choose a photo instead.',
    },
  }[state.kind];

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-bg px-6">
      <View
        style={{ width: sizes.iconDisc, height: sizes.iconDisc }}
        className="items-center justify-center rounded-pill bg-chip"
      >
        <copy.Icon size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      </View>
      <Text accessibilityRole="header" className="text-center font-brico-extrabold text-screen-title text-ink">
        {copy.title}
      </Text>
      <Text className="text-center font-brico-medium text-body text-muted">{copy.body}</Text>
      <View className="mt-2 gap-3 self-stretch">
        {state.kind === 'failed' ? (
          <Button label="Retry" accessibilityLabel="Retry reading the receipt" size="lg" fullWidth onPress={onRetry} />
        ) : null}
        {state.kind === 'unavailable' ? (
          <Button
            label="Camera"
            accessibilityLabel="Take a photo with the camera"
            icon={Camera}
            size="lg"
            fullWidth
            onPress={() => onStart('camera')}
          />
        ) : null}
        {state.kind === 'permission' ? (
          <Button
            label="Open settings"
            accessibilityLabel="Open the phone settings to allow the camera"
            size="lg"
            fullWidth
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        {state.kind !== 'failed' ? (
          <Button
            label="Choose photo"
            accessibilityLabel="Choose a photo of the receipt"
            variant="outline"
            size="lg"
            fullWidth
            onPress={() => onStart('library')}
          />
        ) : null}
        <Button
          label="Type it in"
          accessibilityLabel="Type the items in by hand"
          variant="outline"
          size="lg"
          fullWidth
          onPress={onTypeItIn}
        />
        <Button label="Back" accessibilityLabel="Go back" variant="outline" size="lg" fullWidth onPress={onBack} />
      </View>
    </View>
  );
}
