import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../theme';
import { splitrStore, useSplitr } from '../store';
import { Button } from '../components/ui';

export default function Recovery() {
  const { colors } = useTheme();
  const reason = useSplitr((s) => s.recovery?.reason);
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-4 px-4">
        <View
          style={{ width: sizes.iconDisc, height: sizes.iconDisc }}
          className="items-center justify-center rounded-pill bg-chip"
        >
          <ShieldAlert size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </View>
        <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
          We couldn&apos;t read your saved data
        </Text>
        <Text className="font-brico-medium text-body text-muted">
          Something went wrong while opening your bills. A copy of what was on the phone has been kept as a backup, so
          nothing was erased. You can start fresh now.
        </Text>
        {reason ? <Text className="font-brico-semibold text-meta text-muted">{reason}</Text> : null}
        <Button
          variant="destructive"
          size="lg"
          fullWidth
          label="Start fresh"
          accessibilityLabel="Start fresh with empty data"
          onPress={() => splitrStore.getState().confirmRecovery()}
        />
      </View>
    </SafeAreaView>
  );
}
