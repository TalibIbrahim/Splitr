import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronUp, Scale } from 'lucide-react-native';
import { toPaisa } from '@splitr/calculation-engine';
import { sizes } from '@splitr/design-tokens';
import { selectBalances, selectSettleUpPlan, useSplitr } from '../store';
import { useTheme } from '../theme';
import { href } from '../lib/routes';
import { Button, Money } from '../components/ui';
import { EmptyState } from '../components/bill';

export default function BalancesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const plan = useSplitr(selectSettleUpPlan());
  const balances = useSplitr(selectBalances());
  const bills = useSplitr((s) => s.root.bills);
  const markSettledWith = useSplitr((s) => s.markSettledWith);
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const billName = (id: string): string => bills.find((b) => b.id === id)?.restaurantName ?? 'Bill';
  const meIn = (id: string): string | null => bills.find((b) => b.id === id)?.meParticipantId ?? null;

  const confirmSettle = (key: string, name: string): void => {
    Alert.alert(`Mark all settled with ${name}?`, 'Every pending payment between you and them is marked paid.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark settled',
        onPress: () => {
          const r = markSettledWith(key);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setDone(`Marked ${r.billsTouched} ${r.billsTouched === 1 ? 'bill' : 'bills'} paid with ${name}.`);
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-row items-center gap-1 px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center active:opacity-pressed"
        >
          <ChevronLeft size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
        <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
          Balances
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
        {done ? (
          <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 rounded-button bg-chip p-3">
            <Check size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="flex-1 font-brico-bold text-body-small text-ink">{done}</Text>
          </View>
        ) : null}

        {plan.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="All square"
            body="Nobody owes anybody."
            action={{ label: 'Back home', onPress: () => router.back() }}
          />
        ) : (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1 rounded-card bg-surface-2 p-4">
                <Text className="font-brico-bold text-body-small text-ink">You owe</Text>
                <Money amount={balances.youOwe} variant="card" />
              </View>
              <View className="flex-1 rounded-card bg-surface-2 p-4">
                <Text className="font-brico-bold text-body-small text-ink">owes you</Text>
                <Money amount={balances.owedToYou} variant="card" />
              </View>
            </View>

            {plan.map((c) => {
              const theyOwe = c.net > 0;
              const Icon = theyOwe ? ArrowDownLeft : ArrowUpRight;
              const tag = theyOwe ? 'owes you' : 'you owe';
              const expanded = open === c.key;
              const Chevron = expanded ? ChevronUp : ChevronDown;
              return (
                <View key={c.key} className="gap-2 rounded-card bg-surface-2 p-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${c.displayName}, ${tag}, ${expanded ? 'hide' : 'show'} bills`}
                    onPress={() => setOpen(expanded ? null : c.key)}
                    style={{ minHeight: sizes.minTouch }}
                    className="flex-row items-center justify-between gap-2 active:opacity-pressed"
                  >
                    <View className="flex-1 gap-1">
                      <Text numberOfLines={1} className="font-brico-extrabold text-item-name text-ink">
                        {c.displayName}
                      </Text>
                      <View className="flex-row items-center gap-1 self-start rounded-pill bg-chip px-2 py-0.5">
                        <Icon size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                        <Text className="font-brico-bold text-meta text-ink">{tag}</Text>
                      </View>
                    </View>
                    <Money amount={toPaisa(Math.abs(c.net))} variant="card" />
                    <Chevron size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                  </Pressable>

                  {expanded ? (
                    <View className="gap-1">
                      {c.sources.map((t) => {
                        const owe = t.from === meIn(t.billId);
                        const dir = owe ? 'you owe' : 'owes you';
                        return (
                          <Pressable
                            key={`${t.billId}-${t.from}-${t.to}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${billName(t.billId)}, ${dir}`}
                            onPress={() => router.push(href(`/bill/${t.billId}/breakdown`))}
                            style={{ minHeight: sizes.minTouch }}
                            className="flex-row items-center justify-between gap-2 border-t border-chip active:opacity-pressed"
                          >
                            <Text numberOfLines={1} className="flex-1 font-brico-semibold text-body-small text-ink">
                              {billName(t.billId)}
                            </Text>
                            <Text className="font-brico-semibold text-meta text-muted">{dir}</Text>
                            <Money amount={t.amount} variant="body" />
                          </Pressable>
                        );
                      })}
                      <Button
                        label={`Mark all settled with ${c.displayName}`}
                        variant="outline"
                        fullWidth
                        accessibilityLabel={`Mark all settled with ${c.displayName}`}
                        onPress={() => confirmSettle(c.key, c.displayName)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
