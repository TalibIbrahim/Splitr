import { useState } from 'react';
import { Text, View } from 'react-native';
import Constants from 'expo-constants';
import { RefreshCw } from 'lucide-react-native';
import { splitrStore, useSplitr } from '../../store';
import { announce } from '../../lib/a11y';
import { checkForUpdate, compareSemver } from '../../lib/update-check';
import { Button } from '../ui';
import { ToggleRow } from '../bill/flow/ToggleRow';

/** D36. Settings -> Updates: the daily-check toggle, a manual check and the running version. */
export function UpdatesSection() {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const enabled = useSplitr((s) => s.root.meta?.updateCheck?.enabled !== false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const checkNow = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    const r = await checkForUpdate(version);
    let text: string;
    if (!r) {
      text = "Couldn't check right now";
    } else {
      splitrStore.getState().recordUpdateCheck({ ...r, checkedAt: new Date().toISOString() });
      text = compareSemver(r.latestVersion, version) > 0 ? `Update available: v${r.latestVersion}` : "You're up to date";
    }
    setResult(text);
    announce(text);
    setBusy(false);
  };

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
        Updates
      </Text>
      <ToggleRow
        title="Check for updates"
        subtitle="Looks on GitHub at most once a day"
        on={enabled}
        onChange={(on) => splitrStore.getState().setUpdateChecksEnabled(on)}
      />
      <Button
        label="Check now"
        icon={RefreshCw}
        variant="outline"
        fullWidth
        loading={busy}
        accessibilityLabel="Check for a new version now"
        onPress={() => void checkNow()}
      />
      {result ? (
        <Text accessibilityLiveRegion="polite" className="font-brico-bold text-body-small text-ink">
          {result}
        </Text>
      ) : null}
      <Text className="font-brico-semibold text-meta text-muted">Current version {version}</Text>
    </View>
  );
}
