import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, Info, Minus, Plus } from 'lucide-react-native';
import { toBasisPoints, type Assignment, type Item, type Paisa } from '@splitr/calculation-engine';
import { parseRupees, setAmounts, setPercent, setUnits } from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { formatBp, parsePercentToBp, percentErrorText } from '../../../lib/percent';
import { toRupeeInputText } from '../../../lib/format-money';
import { checkSum } from '../../../lib/sums';
import { Button, ModalSheet, Money } from '../../ui';
import { AmountField, PercentField } from './Field';
import { Segmented } from './Segmented';
import { ToggleChip } from './ToggleChip';
import { rupeesErrorText } from './messages';

export interface SplitPerson {
  id: string;
  name: string;
  isCurrentUser?: boolean;
}

type Tab = 'equal' | 'units' | 'percent' | 'amounts';

interface SplitSheetProps {
  item: Item | null;
  people: readonly SplitPerson[];
  onClose: () => void;
  onApply: (item: Item, assignment: Assignment) => void;
}

function assignedIds(a: Assignment): string[] {
  switch (a.kind) {
    case 'unassigned':
      return [];
    case 'equal':
      return [...a.participantIds];
    default:
      return a.entries.map((e) => e.participantId);
  }
}

function initialTab(item: Item): Tab {
  const k = item.assignment.kind;
  if (k === 'units' && item.quantity > 1) return 'units';
  if (k === 'percent') return 'percent';
  if (k === 'amounts') return 'amounts';
  return 'equal';
}

function StatusLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const Icon = ok ? Check : Info;
  return (
    <View className="flex-row items-center gap-2 rounded-button bg-chip px-3 py-2">
      <Icon size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
      <View className="flex-1 flex-row flex-wrap items-baseline gap-1">{children}</View>
    </View>
  );
}
const statusText = 'font-brico-bold text-body-small text-ink';

function PersonRow({ person, children }: { person: SplitPerson; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      <Text numberOfLines={1} style={{ minHeight: sizes.minTouch }} className="flex-1 pt-3 font-brico-bold text-body text-ink">
        {person.isCurrentUser ? 'You' : person.name}
      </Text>
      <View className="flex-[1.2]">{children}</View>
    </View>
  );
}

/** Long-press split editor for one item: Equal / Units / Percent / Amounts with live validation text. */
export function SplitSheet({ item, people, onClose, onApply }: SplitSheetProps) {
  return (
    <ModalSheet visible={item !== null} onClose={onClose}>
      {item ? <SplitBody key={item.id} item={item} people={people} onClose={onClose} onApply={onApply} /> : null}
    </ModalSheet>
  );
}

function SplitBody({
  item,
  people,
  onClose,
  onApply,
}: {
  item: Item;
  people: readonly SplitPerson[];
  onClose: () => void;
  onApply: (item: Item, assignment: Assignment) => void;
}) {
  const { colors } = useTheme();
  const a = item.assignment;
  const [tab, setTab] = useState<Tab>(() => initialTab(item));
  const [equalIds, setEqualIds] = useState<string[]>(() => assignedIds(a));
  const [units, setUnitsState] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (a.kind === 'units') for (const e of a.entries) m[e.participantId] = e.units;
    return m;
  });
  const [pct, setPct] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (a.kind === 'percent') for (const e of a.entries) m[e.participantId] = formatBp(e.bp);
    return m;
  });
  const [amts, setAmts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    if (a.kind === 'amounts') for (const e of a.entries) m[e.participantId] = toRupeeInputText(e.amount);
    return m;
  });

  const tabs: { value: Tab; label: string }[] = [
    { value: 'equal', label: 'Equal' },
    ...(item.quantity > 1 ? [{ value: 'units' as const, label: 'Units' }] : []),
    { value: 'percent', label: 'Percent' },
    { value: 'amounts', label: 'Amounts' },
  ];

  // ---- per-tab validation + the assignment each would apply ----
  let assignment: Assignment | null = null;
  let status: ReactNode = null;
  let body: ReactNode = null;

  if (tab === 'equal') {
    assignment = equalIds.length === 0 ? { kind: 'unassigned' } : { kind: 'equal', participantIds: equalIds };
    status = (
      <StatusLine ok={equalIds.length > 0}>
        <Text className={statusText}>
          {equalIds.length === 0
            ? 'Nobody picked. Saving clears the split.'
            : equalIds.length === 1
              ? 'Only one person pays for this'
              : `Split equally between ${equalIds.length} people`}
        </Text>
      </StatusLine>
    );
    body = (
      <View className="flex-row flex-wrap gap-2">
        {people.map((p) => (
          <ToggleChip
            key={p.id}
            label={p.isCurrentUser ? 'You' : p.name}
            on={equalIds.includes(p.id)}
            accessibilityLabel={`${p.isCurrentUser ? 'You' : p.name} shares ${item.name}`}
            onPress={() =>
              setEqualIds((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))
            }
          />
        ))}
      </View>
    );
  } else if (tab === 'units') {
    const entries = people
      .map((p) => ({ participantId: p.id, units: units[p.id] ?? 0 }))
      .filter((e) => e.units > 0);
    const { remaining, gap } = checkSum(
      entries.map((e) => e.units),
      item.quantity,
    );
    const ok = remaining === 0 && entries.length > 0;
    if (ok) assignment = setUnits(item, entries).assignment;
    status = (
      <StatusLine ok={ok}>
        <Text className={statusText}>
          {ok
            ? `All ${item.quantity} given out`
            : remaining > 0
              ? `${gap} of ${item.quantity} still to give out`
              : `${gap} too many. There are only ${item.quantity}`}
        </Text>
      </StatusLine>
    );
    body = (
      <View className="gap-2">
        {people.map((p) => {
          const n = units[p.id] ?? 0;
          const who = p.isCurrentUser ? 'you' : p.name;
          return (
            <PersonRow key={p.id} person={p}>
              <View className="flex-row items-center justify-end gap-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`One less for ${who}`}
                  onPress={() => setUnitsState((m) => ({ ...m, [p.id]: Math.max(0, n - 1) }))}
                  style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                  className="items-center justify-center rounded-button bg-surface-2 active:opacity-pressed"
                >
                  <Minus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                </Pressable>
                <Text
                  accessibilityLabel={`${n} for ${who}`}
                  style={{ minWidth: sizes.minTouch, fontVariant: ['tabular-nums'] }}
                  className="text-center font-brico-extrabold text-item-name text-ink"
                >
                  {n}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`One more for ${who}`}
                  onPress={() => setUnitsState((m) => ({ ...m, [p.id]: n + 1 }))}
                  style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                  className="items-center justify-center rounded-button bg-surface-2 active:opacity-pressed"
                >
                  <Plus size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                </Pressable>
              </View>
            </PersonRow>
          );
        })}
      </View>
    );
  } else if (tab === 'percent') {
    const rows = people.map((p) => {
      const text = pct[p.id] ?? '';
      const r = text.trim() === '' ? ({ ok: true, bp: 0 } as const) : parsePercentToBp(text);
      return { p, text, r };
    });
    const bad = rows.some((x) => !x.r.ok);
    const bps = rows.map((x) => (x.r.ok ? x.r.bp : 0));
    const { remaining, gap } = checkSum(bps, 10_000);
    const ok = !bad && remaining === 0;
    if (ok) {
      assignment = setPercent(
        item,
        rows.flatMap((x) => (x.r.ok && x.r.bp > 0 ? [{ participantId: x.p.id, bp: toBasisPoints(x.r.bp) }] : [])),
      ).assignment;
    }
    status = (
      <StatusLine ok={ok}>
        <Text className={statusText}>
          {bad
            ? 'Fix the highlighted percentages'
            : ok
              ? 'Adds up to 100%'
              : remaining > 0
                ? `${formatBp(gap)}% still to give out`
                : `${formatBp(gap)}% over 100%`}
        </Text>
      </StatusLine>
    );
    body = (
      <View className="gap-2">
        {rows.map(({ p, text, r }) => (
          <PersonRow key={p.id} person={p}>
            <PercentField
              accessibilityLabel={`Percent for ${p.isCurrentUser ? 'you' : p.name}`}
              placeholder="0"
              value={text}
              onChangeText={(t) => setPct((m) => ({ ...m, [p.id]: t }))}
              error={r.ok ? undefined : percentErrorText(r.reason)}
            />
          </PersonRow>
        ))}
      </View>
    );
  } else {
    const rows = people.map((p) => {
      const text = amts[p.id] ?? '';
      const r = text.trim() === '' ? ({ ok: true, paisa: 0 as Paisa } as const) : parseRupees(text);
      return { p, text, r };
    });
    const bad = rows.some((x) => !x.r.ok);
    const { remaining, gap } = checkSum(
      rows.map((x) => (x.r.ok ? x.r.paisa : 0)),
      item.lineTotal,
    );
    const ok = !bad && remaining === 0;
    if (ok) {
      assignment = setAmounts(
        item,
        rows.flatMap((x) => (x.r.ok && x.r.paisa !== 0 ? [{ participantId: x.p.id, amount: x.r.paisa }] : [])),
      ).assignment;
    }
    status = (
      <StatusLine ok={ok}>
        {bad ? (
          <Text className={statusText}>Fix the highlighted amounts</Text>
        ) : ok ? (
          <Text className={statusText}>Adds up to the item total</Text>
        ) : remaining > 0 ? (
          <>
            <Money amount={gap as Paisa} variant="body" />
            <Text className={statusText}>still to give out</Text>
          </>
        ) : (
          <>
            <Money amount={gap as Paisa} variant="body" />
            <Text className={statusText}>over the item total</Text>
          </>
        )}
      </StatusLine>
    );
    body = (
      <View className="gap-2">
        {rows.map(({ p, text, r }) => (
          <PersonRow key={p.id} person={p}>
            <AmountField
              accessibilityLabel={`Amount for ${p.isCurrentUser ? 'you' : p.name}`}
              placeholder="0"
              value={text}
              onChangeText={(t) => setAmts((m) => ({ ...m, [p.id]: t }))}
              error={r.ok ? undefined : rupeesErrorText(r.reason)}
            />
          </PersonRow>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="font-brico-extrabold text-screen-title text-ink">Split {item.name}</Text>
        <View className="flex-row items-baseline gap-2">
          <Money amount={item.lineTotal} variant="body" />
          {item.quantity > 1 ? (
            <Text className="font-brico-semibold text-meta text-muted">{item.quantity} in total</Text>
          ) : null}
        </View>
      </View>
      <Segmented label="How to split" options={tabs} value={tab} onChange={setTab} />
      {body}
      {status}
      <View className="flex-row gap-3">
        <Button label="Cancel" accessibilityLabel="Cancel without changing the split" variant="outline" onPress={onClose} />
        <View className="flex-1">
          <Button
            label={tab === 'equal' && equalIds.length === 0 ? 'Clear split' : 'Save split'}
            accessibilityLabel="Save this split"
            fullWidth
            disabled={assignment === null}
            onPress={() => {
              if (assignment) onApply(item, assignment);
            }}
          />
        </View>
      </View>
    </View>
  );
}
