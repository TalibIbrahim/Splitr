import { useState } from 'react';
import { Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import { toBasisPoints } from '@splitr/calculation-engine';
import { parseRupees } from '@splitr/bill-domain';
import type { CardOffer } from '@splitr/shared-types';
import { sizes } from '@splitr/design-tokens';
import { parsePercentToBp, percentErrorText } from '../../lib/percent';
import { isIsoDate, todayIso } from '../../lib/date';
import { DAY_SHORT, WEEK_ORDER } from '../../lib/offer-text';
import { useTheme } from '../../theme';
import { Button, ModalSheet, TextField } from '../ui';
import { AmountField, Field, PercentField } from '../bill/flow/Field';
import { Segmented } from '../bill/flow/Segmented';
import { ToggleChip } from '../bill/flow/ToggleChip';
import { rupeesErrorText } from '../bill/flow/messages';

interface AddOfferSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (offer: CardOffer) => void;
  initialRestaurant?: string;
}

type Kind = 'percent' | 'fixed';

export function AddOfferSheet({ visible, onClose, onSave, initialRestaurant }: AddOfferSheetProps) {
  const { colors } = useTheme();
  const [bank, setBank] = useState('');
  const [card, setCard] = useState('');
  const [restaurant, setRestaurant] = useState(initialRestaurant ?? '');
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('');
  const [cap, setCap] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [days, setDays] = useState<readonly number[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [terms, setTerms] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setBank('');
    setCard('');
    setRestaurant(initialRestaurant ?? '');
    setKind('percent');
    setValue('');
    setCap('');
    setMinSpend('');
    setDays([]);
    setFrom('');
    setTo('');
    setTerms('');
    setProblem(null);
  };

  const submit = () => {
    const fail = (m: string) => setProblem(m);
    if (bank.trim() === '') return fail('Enter the bank');
    if (restaurant.trim() === '') return fail('Enter the restaurant');
    const cards = card
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    if (cards.length === 0) return fail('Enter at least one card, e.g. Platinum Debit');

    let discount: CardOffer['discount'];
    let capPaisa: CardOffer['capPaisa'];
    if (kind === 'percent') {
      const p = parsePercentToBp(value);
      if (!p.ok) return fail(value.trim() === '' ? 'Enter the discount percentage' : percentErrorText(p.reason));
      discount = { type: 'percent', bp: toBasisPoints(p.bp) };
      if (cap.trim() !== '') {
        const c = parseRupees(cap);
        if (!c.ok) return fail(`Cap: ${rupeesErrorText(c.reason)}`);
        capPaisa = c.paisa;
      }
    } else {
      const a = parseRupees(value);
      if (!a.ok) return fail(`Discount: ${rupeesErrorText(a.reason)}`);
      discount = { type: 'fixed', amount: a.paisa };
    }
    let minSpendPaisa: CardOffer['minSpendPaisa'];
    if (minSpend.trim() !== '') {
      const m = parseRupees(minSpend);
      if (!m.ok) return fail(`Minimum bill: ${rupeesErrorText(m.reason)}`);
      minSpendPaisa = m.paisa;
    }
    const f = from.trim();
    const t = to.trim();
    if (f !== '' && !isIsoDate(f)) return fail('Start date: use YYYY-MM-DD, e.g. 2026-12-01');
    if (t !== '' && !isIsoDate(t)) return fail('End date: use YYYY-MM-DD, e.g. 2026-12-31');
    if (f !== '' && t !== '' && f > t) return fail('The end date is before the start date');

    onSave({
      id: `user-${randomUUID()}`,
      bank: bank.trim(),
      cardProducts: cards,
      restaurant: restaurant.trim(),
      city: 'Lahore',
      discount,
      ...(capPaisa !== undefined ? { capPaisa } : {}),
      ...(minSpendPaisa !== undefined ? { minSpendPaisa } : {}),
      ...(days.length > 0 ? { daysOfWeek: [...days].sort((a, b) => a - b) } : {}),
      ...(f !== '' ? { validFrom: f } : {}),
      ...(t !== '' ? { validTo: t } : {}),
      terms: terms.trim(),
      source: { kind: 'user', addedOn: todayIso() },
    });
    reset();
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Add an offer" closeLabel="Close add an offer" className="gap-3">
      <Text className="font-brico-medium text-body-small text-muted">
        Saved on this phone only and marked "Added by you".
      </Text>
      <TextField value={bank} onChangeText={setBank} placeholder="Bank, e.g. HBL" accessibilityLabel="Bank" maxLength={60} />
      <TextField
        value={card}
        onChangeText={setCard}
        placeholder="Card names, separated by commas"
        accessibilityLabel="Card names, separated by commas"
        maxLength={120}
      />
      <TextField
        value={restaurant}
        onChangeText={setRestaurant}
        placeholder="Restaurant"
        accessibilityLabel="Restaurant"
        maxLength={80}
      />
      <Segmented
        label="Discount type"
        options={[
          { value: 'percent', label: 'Percent off' },
          { value: 'fixed', label: 'Fixed Rs off' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === 'percent' ? (
        <>
          <PercentField accessibilityLabel="Discount percentage" placeholder="25" value={value} onChangeText={setValue} />
          <AmountField
            accessibilityLabel="Maximum saving in rupees, optional"
            placeholder="Up to (optional)"
            value={cap}
            onChangeText={setCap}
          />
        </>
      ) : (
        <AmountField
          accessibilityLabel="Discount amount in rupees"
          placeholder="500"
          value={value}
          onChangeText={setValue}
        />
      )}
      <AmountField
        accessibilityLabel="Minimum bill in rupees, optional"
        placeholder="Minimum bill (optional)"
        value={minSpend}
        onChangeText={setMinSpend}
      />
      <View className="gap-2">
        <Text className="font-brico-bold text-body-small text-ink">Valid on (leave empty for every day)</Text>
        <View className="flex-row flex-wrap gap-2">
          {WEEK_ORDER.map((d) => (
            <ToggleChip
              key={d}
              label={DAY_SHORT[d] ?? ''}
              on={days.includes(d)}
              onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
            />
          ))}
        </View>
      </View>
      <Field
        accessibilityLabel="Valid from, YYYY-MM-DD, optional"
        placeholder="From YYYY-MM-DD (optional)"
        value={from}
        onChangeText={setFrom}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        accessibilityLabel="Valid until, YYYY-MM-DD, optional"
        placeholder="Until YYYY-MM-DD (optional)"
        value={to}
        onChangeText={setTo}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField value={terms} onChangeText={setTerms} placeholder="Terms (optional)" accessibilityLabel="Terms, optional" maxLength={200} />

      {problem ? (
        <View className="flex-row items-center gap-2">
          <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
          <Text className="flex-1 font-brico-bold text-body-small text-ink">{problem}</Text>
        </View>
      ) : null}
      <Button label="Save offer" accessibilityLabel="Save offer" onPress={submit} />
    </ModalSheet>
  );
}
