import { Pressable, Text, View } from 'react-native';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { StepHeader, type BillStep } from '../../../components/bill';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { HOME_HREF, billHref } from '../../../components/bill/flow/nav';

const STEP_ROUTE = { items: 'items', assign: 'assign', charges: 'charges', split: 'breakdown' } as const;

function stepFor(segment: string | undefined): BillStep {
  switch (segment) {
    case 'assign':
      return 'assign';
    case 'charges':
      return 'charges';
    case 'breakdown':
      return 'split';
    default:
      return 'items';
  }
}

export default function BillLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const segments = useSegments() as string[];
  const last = segments[segments.length - 1];
  const { id, bill } = useBillRoute();

  if (!bill) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-bg">
        <BillNotFound />
      </SafeAreaView>
    );
  }

  const onBreakdown = last === 'breakdown';
  // Settled bills are read-only: the breakdown screen (rendered from the frozen snapshot) is the only stop.
  if (bill.status === 'settled' && !onBreakdown) {
    return <Redirect href={billHref(id, 'breakdown')} />;
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'fade', animationDuration: 150 }} />
  );
  if (bill.status === 'settled') return stack;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close bill and go Home"
          onPress={() => router.replace(HOME_HREF)}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center rounded-pill active:opacity-pressed"
        >
          <X size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} className="flex-1 font-brico-extrabold text-screen-title text-ink">
          {bill.restaurantName.trim() || 'New bill'}
        </Text>
      </View>
      <View className="px-2">
        <StepHeader current={stepFor(last)} onStep={(s) => router.replace(billHref(id, STEP_ROUTE[s]))} />
      </View>
      <View className="flex-1">{stack}</View>
    </SafeAreaView>
  );
}
