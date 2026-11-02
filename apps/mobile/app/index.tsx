import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { sizes } from '@splitr/design-tokens';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <View className="flex-row items-baseline">
        <Text className="font-brico-extrabold text-hero-amount text-ink">splitr</Text>
        <Text className="font-brico-extrabold text-hero-amount text-accent">.</Text>
      </View>
      {__DEV__ ? (
        <Link
          href="/dev/components"
          accessibilityLabel="Open the component gallery"
          style={{ minHeight: sizes.minTouch, paddingTop: 12 }}
          className="font-brico-bold text-body text-muted"
        >
          Dev: components
        </Link>
      ) : null}
    </View>
  );
}
