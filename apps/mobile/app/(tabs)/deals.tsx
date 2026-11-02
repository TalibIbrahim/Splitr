import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { CreditCard, Plus, Tag } from 'lucide-react-native';
import { offerStatus } from '@splitr/bill-domain';
import type { CardOffer } from '@splitr/shared-types';
import { selectAllOffers, selectCardLabels, splitrStore, useSplitr } from '../../store';
import { todayIso } from '../../lib/date';
import { Button, FilterChip, TextField } from '../../components/ui';
import { EmptyState } from '../../components/bill';
import { OfferCard } from '../../components/deals/OfferCard';
import { MyCardsSheet } from '../../components/deals/MyCardsSheet';
import { AddOfferSheet } from '../../components/deals/AddOfferSheet';

type Filter = 'all' | 'mine' | 'active';
const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My cards' },
  { key: 'active', label: 'Active only' },
];

export default function Deals() {
  const params = useLocalSearchParams<{ restaurant?: string }>();
  const offers = useSplitr(selectAllOffers());
  const cards = useSplitr(selectCardLabels());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState(params.restaurant ?? '');
  const [cardsOpen, setCardsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (params.restaurant !== undefined) setQuery(params.restaurant);
  }, [params.restaurant]);

  const today = todayIso();
  const suggestions = useMemo(
    () => [...new Set(offers.flatMap((o) => o.cardProducts))].sort((a, b) => a.localeCompare(b)),
    [offers],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mine = cards.map((c) => c.label.trim().toLowerCase()).filter((l) => l !== '');
    const rows = offers
      .map((offer) => ({ offer, ...offerStatus(offer, today) }))
      .filter(({ offer, status }) => {
        if (q !== '' && !`${offer.restaurant} ${offer.bank}`.toLowerCase().includes(q)) return false;
        if (filter === 'active' && status !== 'active' && status !== 'unknown-validity') return false;
        if (filter === 'mine' && !offer.cardProducts.some((p) => mine.some((l) => p.toLowerCase().includes(l)))) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.offer.restaurant.localeCompare(b.offer.restaurant) ||
          Number(b.status === 'active') - Number(a.status === 'active') ||
          a.offer.bank.localeCompare(b.offer.bank) ||
          a.offer.id.localeCompare(b.offer.id),
      );
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.offer.restaurant;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [offers, cards, filter, query, today]);

  const isUser = (o: CardOffer) => o.source.kind === 'user';
  const noCards = filter === 'mine' && cards.length === 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pb-24 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
          Deals
        </Text>

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search a restaurant or bank"
          accessibilityLabel="Search offers by restaurant or bank"
          returnKeyType="search"
        />

        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((f) => (
            <FilterChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Button
            label="My cards"
            accessibilityLabel="Manage my cards"
            variant="outline"
            icon={CreditCard}
            onPress={() => setCardsOpen(true)}
          />
          <Button label="Add an offer" accessibilityLabel="Add an offer" icon={Plus} onPress={() => setAddOpen(true)} />
        </View>

        {groups.length === 0 ? (
          <EmptyState
            icon={Tag}
            title={noCards ? 'No cards added yet' : 'No offers found'}
            body={noCards ? 'Add the name of a card to see offers for it.' : 'Try a different search or filter.'}
            {...(noCards ? { action: { label: 'Add a card', onPress: () => setCardsOpen(true) } } : {})}
          />
        ) : (
          groups.map(([restaurant, rows]) => (
            <View key={restaurant} className="gap-2">
              <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
                {restaurant}
              </Text>
              {rows.map(({ offer, status, stale }) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  status={status}
                  stale={stale}
                  {...(isUser(offer) ? { onRemove: () => splitrStore.getState().removeUserOffer(offer.id) } : {})}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <MyCardsSheet
        visible={cardsOpen}
        onClose={() => setCardsOpen(false)}
        cards={cards}
        suggestions={suggestions}
        onAdd={(l) => splitrStore.getState().addCardLabel(l)}
        onRemove={(id) => splitrStore.getState().removeCardLabel(id)}
      />
      <AddOfferSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(o) => splitrStore.getState().addUserOffer(o)}
      />
    </SafeAreaView>
  );
}
