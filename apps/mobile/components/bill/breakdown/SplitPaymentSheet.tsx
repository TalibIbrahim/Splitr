import { useEffect, useState } from 'react';
import { toRupeeInputText } from '../../../lib/format-money';
import { Text, View } from 'react-native';
import { Check, Info } from 'lucide-react-native';
import type { Contribution, Paisa } from '@splitr/calculation-engine';
import { parseRupees } from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { splitPaymentStatus } from '../../../lib/payments';
import { Button, ModalSheet, Money } from '../../ui';
import { MoneyInput } from '../MoneyInput';

interface SplitPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  total: Paisa;
  people: readonly { id: string; name: string; isMe: boolean }[];
  /** Existing contributions, used to prefill the rows. */
  initial: readonly Contribution[];
  onSave: (contributions: Contribution[]) => void;
}

/** Rupee text for prefilling the inputs. */
function prefill(amount: number | undefined): string {
  return amount === undefined || amount === 0 ? '' : toRupeeInputText(amount);
}

interface Row {
  id: string;
  paisa: number | null;
  error?: string;
}

export function SplitPaymentSheet({ visible, onClose, total, people, initial, onSave }: SplitPaymentSheetProps) {
  const { colors } = useTheme();
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const next: Record<string, string> = {};
    for (const p of people) next[p.id] = prefill(initial.find((c) => c.participantId === p.id)?.amount);
    setTexts(next);
    // Seed only when the sheet opens.
  }, [visible]);

  const rows: Row[] = people.map((p): Row => {
    const t = (texts[p.id] ?? '').trim();
    if (t === '') return { id: p.id, paisa: 0 };
    const r = parseRupees(t);
    return r.ok && r.paisa >= 0
      ? { id: p.id, paisa: r.paisa }
      : { id: p.id, paisa: null, error: 'Enter an amount like 1500 or 1500.50' };
  });
  const status = splitPaymentStatus(
    total,
    rows.map((x) => x.paisa),
  );

  const save = (): void => {
    const contributions: Contribution[] = [];
    for (const x of rows) {
      if (x.paisa !== null && x.paisa > 0) contributions.push({ participantId: x.id, amount: x.paisa as Paisa });
    }
    onSave(contributions);
  };

  const StatusIcon = status.direction === 'done' ? Check : Info;

  return (
    <ModalSheet visible={visible} onClose={onClose} closeLabel="Close split payment">
      <Text className="mb-1 font-brico-extrabold text-screen-title text-ink">Split payment</Text>
      <View className="mb-3 flex-row items-center gap-2">
        <Text className="font-brico-medium text-body-small text-muted">Bill total</Text>
        <Money amount={total} variant="body" />
      </View>
      <View className="gap-3">
        {people.map((p, i) => {
          const error = rows[i]?.error;
          return (
            <View key={p.id} className="gap-1">
              <Text className="font-brico-bold text-body-small text-ink">{p.isMe ? 'You' : p.name}</Text>
              <MoneyInput
                value={texts[p.id] ?? ''}
                onChangeText={(t) => setTexts((s) => ({ ...s, [p.id]: t }))}
                accessibilityLabel={`Amount paid by ${p.isMe ? 'you' : p.name}`}
                {...(error ? { error } : {})}
              />
            </View>
          );
        })}
      </View>
      <View
        accessibilityLiveRegion="polite"
        className={`my-3 flex-row items-center gap-2 rounded-button p-3 ${
          status.direction === 'done' ? 'bg-chip' : 'border-2 border-ink'
        }`}
      >
        <StatusIcon size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        {status.direction === 'done' ? (
          <Text className="font-brico-bold text-body-small text-ink">Adds up to the total</Text>
        ) : (
          <>
            <Money amount={status.gap as Paisa} variant="body" />
            <Text className="font-brico-bold text-body-small text-ink">
              {status.direction === 'left' ? 'remaining' : 'too much'}
            </Text>
          </>
        )}
      </View>
      <Button
        label="Save"
        size="lg"
        fullWidth
        disabled={!status.canSave}
        accessibilityLabel={status.canSave ? 'Save who paid' : 'Save, disabled until the amounts add up to the total'}
        onPress={save}
      />
    </ModalSheet>
  );
}
