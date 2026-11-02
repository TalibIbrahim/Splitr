import type { ComponentRef, Ref } from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { ThemeProvider, useTheme } from '../../theme';
import { Money } from '../ui';
import type { ShareCardModel } from '../../lib/share-image';

/** Logical card size (4:5). It is captured at 2x to give the 1080 x 1350 image. */
export const CARD_SIZE = { width: 540, height: 675 } as const;
export type CardView = ComponentRef<typeof View>;
const MAX_ROWS = 6;
const MAX_PAY_LINES = 5;

function Paid({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-1 rounded-pill bg-chip px-2 py-0.5">
      <Check size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      <Text className="font-brico-bold text-meta text-ink">{label}</Text>
    </View>
  );
}

function CardBody({ model }: { model: ShareCardModel }) {
  const shown = model.rows.slice(0, MAX_ROWS);
  const hidden = model.rows.length - shown.length;
  let budget = MAX_PAY_LINES;

  return (
    <View
      style={{ width: CARD_SIZE.width, height: CARD_SIZE.height }}
      className="justify-between overflow-hidden bg-bg p-8"
    >
      <View className="gap-4">
        <View className="flex-row items-end justify-between">
          <View accessible accessibilityLabel="splitr" className="flex-row items-baseline">
            <Text className="font-brico-extrabold text-screen-title text-ink">splitr</Text>
            <Text className="font-brico-extrabold text-screen-title text-accent">.</Text>
          </View>
          <Text numberOfLines={1} className="max-w-[300px] font-brico-semibold text-meta text-muted">
            {model.restaurant} · {model.dateLabel}
          </Text>
        </View>

        <View>
          <Text className="font-brico-semibold text-meta text-muted">Total</Text>
          <Money amount={model.total} variant="hero" />
        </View>

        <View className="gap-2">
          {shown.map((r) => (
            <View
              key={r.id}
              className={`flex-row items-center justify-between rounded-button px-3 py-2 ${
                r.isMe ? 'bg-accent' : 'bg-surface-2'
              }`}
            >
              <View className="flex-1 flex-row items-center gap-2">
                <Text
                  numberOfLines={1}
                  className={`shrink font-brico-bold text-body ${r.isMe ? 'text-on-accent' : 'text-ink'}`}
                >
                  {r.name}
                </Text>
                {r.paid ? <Paid label="paid" /> : null}
              </View>
              <Money amount={r.amount} variant="item" onAccent={r.isMe} />
            </View>
          ))}
          {hidden > 0 ? (
            <Text className="font-brico-semibold text-meta text-muted">and {hidden} more</Text>
          ) : null}
        </View>

        {model.payBlocks.map((b) => {
          if (budget <= 0) return null;
          const lines = b.lines.slice(0, budget);
          budget -= lines.length;
          return (
            <View key={b.to} className="gap-1">
              <Text className="font-brico-extrabold text-item-name text-ink">Pay {b.to}</Text>
              {lines.map((l) => (
                <View key={`${l.from}-${l.amount}`} className="flex-row items-center justify-between">
                  <Text className="font-brico-medium text-body-small text-ink">{l.from}</Text>
                  <View className="flex-row items-center gap-2">
                    {l.paid ? <Paid label="paid" /> : null}
                    <Money amount={l.amount} variant="body" />
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      <Text className="font-brico-bold text-body-small text-muted">Split with splitr.</Text>
    </View>
  );
}

interface ShareCardProps {
  model: ShareCardModel;
  /** Ref of the capture root (the view handed to react-native-view-shot). */
  captureRef?: Ref<CardView>;
}

/** Presentational share card. Always the light theme so the image is identical everywhere. */
export function ShareCard({ model, captureRef }: ShareCardProps) {
  return (
    <ThemeProvider forceScheme="light">
      <View ref={captureRef} collapsable={false}>
        <CardBody model={model} />
      </View>
    </ThemeProvider>
  );
}
