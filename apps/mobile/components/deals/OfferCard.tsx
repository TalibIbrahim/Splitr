import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { CheckCircle2, Clock, ExternalLink, Info, Trash2, UserRound } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import type { OfferStatus } from '@splitr/bill-domain';
import type { CardOffer } from '@splitr/shared-types';
import { formatMoney } from '../../lib/format-money';
import { NOT_GUARANTEED, STALE_TEXT, offerSummary, sourceLine, statusText } from '../../lib/offer-text';
import { useTheme } from '../../theme';
import { Card, Pill } from '../ui';

interface OfferCardProps {
  offer: CardOffer;
  status: OfferStatus;
  stale: boolean;
  onRemove?: () => void;
}

export function OfferCard({ offer, status, stale, onRemove }: OfferCardProps) {
  const { colors } = useTheme();
  const published = offer.source.kind === 'published' ? offer.source : undefined;
  const confirmRemove = () =>
    Alert.alert('Remove this offer?', `${offer.bank} at ${offer.restaurant} will be deleted from your phone.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemove?.() },
    ]);

  return (
    <Card className="gap-2">
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text className="font-brico-extrabold text-item-name text-ink">{offer.bank}</Text>
          <Text className="font-brico-medium text-body-small text-muted">{offer.cardProducts.join(', ')}</Text>
        </View>
        <Pill
          tone="status"
          icon={status === 'active' ? CheckCircle2 : status === 'unknown-validity' ? Info : Clock}
          label={statusText(offer, status)}
        />
      </View>

      <Text className="font-brico-bold text-body text-ink">{offerSummary(offer)}</Text>
      {offer.minSpendPaisa !== undefined ? (
        <Text className="font-brico-medium text-body-small text-ink">
          Minimum bill {formatMoney(offer.minSpendPaisa)}
        </Text>
      ) : null}
      {offer.terms !== '' ? <Text className="font-brico-medium text-body-small text-muted">{offer.terms}</Text> : null}

      <View className="gap-1 pt-1">
        <View className="flex-row items-center gap-1">
          {published ? null : (
            <UserRound size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          )}
          <Text className="flex-1 font-brico-semibold text-meta text-muted">{sourceLine(offer)}</Text>
        </View>
        {stale ? (
          <View className="flex-row items-center gap-1">
            <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="flex-1 font-brico-bold text-meta text-ink">{STALE_TEXT}</Text>
          </View>
        ) : null}
        <Text className="font-brico-semibold text-meta text-muted">{NOT_GUARANTEED}</Text>
      </View>

      <View className="flex-row flex-wrap gap-2 pt-1">
        {published?.url.startsWith('https://') ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open source for ${offer.bank} at ${offer.restaurant}`}
            onPress={() => {
              void Linking.openURL(published.url).catch(() => {});
            }}
            style={{ minHeight: sizes.minTouch }}
            className="flex-row items-center gap-2 rounded-pill bg-chip px-4 active:opacity-pressed"
          >
            <ExternalLink size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="font-brico-bold text-body-small text-ink">Open source</Text>
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove your offer for ${offer.restaurant}`}
            onPress={confirmRemove}
            style={{ minHeight: sizes.minTouch }}
            className="flex-row items-center gap-2 rounded-pill bg-chip px-4 active:opacity-pressed"
          >
            <Trash2 size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="font-brico-bold text-body-small text-ink">Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
