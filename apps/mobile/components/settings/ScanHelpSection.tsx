import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { announce } from '../../lib/a11y';
import { getLastScan } from '../../lib/last-scan';
import { Button } from '../ui';

/** Settings section: lets the user hand the last scan's recognised text to the developer, only when they choose to. */
export function ScanHelpSection() {
  const [, bump] = useState(0);
  const has = getLastScan() !== null;

  const share = async (): Promise<void> => {
    const ocr = getLastScan();
    if (!ocr) {
      announce('There is no scan to share yet');
      bump((n) => n + 1);
      return;
    }
    try {
      await Share.share({ message: JSON.stringify(ocr, null, 2), title: "Splitr scan text" });
    } catch {
      announce("Couldn't open the share sheet");
    }
  };

  return (
    <View className="gap-2 rounded-card bg-surface-2 p-4">
      <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
        Help improve scanning
      </Text>
      <Text className="font-brico-medium text-body-small text-muted">
        If a receipt was read wrongly, you can share the text the phone recognised from your last scan (not the photo).
        It stays on this phone until you choose to send it, and is forgotten when the app closes.
      </Text>
      <Button
        label="Share last scan's text"
        icon={Share2}
        variant="outline"
        fullWidth
        disabled={!has}
        accessibilityLabel="Share the recognised text from the last scan"
        onPress={() => void share()}
      />
      {!has ? (
        <Text className="font-brico-semibold text-meta text-muted">Scan a receipt first, then it will be available here.</Text>
      ) : null}
    </View>
  );
}
