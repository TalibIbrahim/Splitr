import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Info, Tag } from 'lucide-react-native';
import { compareOffers, offersForRestaurant, offerToAdjustment } from '@splitr/bill-domain';
import type { AdjustmentId } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { sizes } from '@splitr/design-tokens';
import { randomUUID } from 'expo-crypto';
import { selectAllOffers, splitrStore, useSplitr } from '../../store';
import { todayIso } from '../../lib/date';
import { href } from '../../lib/routes';
import { NOT_GUARANTEED, STALE_TEXT, reasonText, sourceLine } from '../../lib/offer-text';
import { useTheme } from '../../theme';
import { Button, Card, Money } from '../ui';

/** "Card offers at {restaurant}": the top 3 offers for this bill, each with what it would save. */
export function CardOffersSection({ bill, onApplied }: { bill: Bill; onApplied?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const all = useSplitr(selectAllOffers());
  const today = todayIso();

  const rows = useMemo(() => {
    const matched = offersForRestaurant(all, bill.restaurantName);
    return matched.length === 0 ? [] : compareOffers(bill, matched, today);
  }, [all, bill, today]);

  if (rows.length === 0) return null;

  const use = (index: number) => {
    const row = rows[index];
    if (!row) return;
    const live = splitrStore.getState().root.bills.find((b) => b.id === bill.id);
    const keep = (live?.adjustments ?? []).filter((a) => a.kind !== 'discount');
    splitrStore.getState().setAdjustments(bill.id, [...keep, offerToAdjustment(row.offer, randomUUID() as AdjustmentId)]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onApplied?.();
  };

  return (
    <View className="gap-2 pt-2">
      <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
        Card offers at {bill.restaurantName}
      </Text>
      {rows.slice(0, 3).map((row, i) => {
        const label = offerToAdjustment(row.offer, 'label' as AdjustmentId).label;
        return (
          <Card key={row.offer.id} className="gap-2">
            {row.applied && row.saving > 0 ? (
              <View className="flex-row flex-wrap items-center gap-x-1">
                <Text className="font-brico-bold text-body text-ink">Save</Text>
                <Money amount={row.saving} variant="item" />
                <Text className="font-brico-bold text-body text-ink">with {label}</Text>
              </View>
            ) : (
              <View className="gap-1">
                <Text className="font-brico-bold text-body text-ink">{label}</Text>
                <View className="flex-row items-center gap-1">
                  <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                  <Text className="flex-1 font-brico-bold text-body-small text-ink">
                    {reasonText(row.reason, row.offer)}
                  </Text>
                </View>
              </View>
            )}
            <View className="gap-1">
              <Text className="font-brico-semibold text-meta text-muted">{sourceLine(row.offer)}</Text>
              {row.stale ? <Text className="font-brico-bold text-meta text-ink">{STALE_TEXT}</Text> : null}
              <Text className="font-brico-semibold text-meta text-muted">{NOT_GUARANTEED}</Text>
            </View>
            {row.applied && row.saving > 0 ? (
              <Button
                label="Use"
                accessibilityLabel={`Use ${label} on this bill`}
                variant="outline"
                icon={Tag}
                onPress={() => use(i)}
              />
            ) : null}
          </Card>
        );
      })}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`See all card offers at ${bill.restaurantName}`}
        onPress={() => router.push(href(`/deals?restaurant=${encodeURIComponent(bill.restaurantName)}`))}
        style={{ minHeight: sizes.minTouch }}
        className="justify-center active:opacity-pressed"
      >
        <Text className="font-brico-bold text-body text-ink underline">
          See all{rows.length > 3 ? ` ${rows.length}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}
