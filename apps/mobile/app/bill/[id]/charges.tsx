import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Info, Trash2 } from 'lucide-react-native';
import { toBasisPoints, type Adjustment, type AdjustmentId, type Paisa } from '@splitr/calculation-engine';
import {
  cardDiscount,
  defaultOrders,
  describeAdjustment,
  fee,
  parseRupees,
  serviceCharge,
  tax,
  tip,
  type PresetDescription,
} from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { splitrStore } from '../../../store';
import { formatBp, parsePercentToBp, percentErrorText } from '../../../lib/percent';
import { toRupeeInputText } from '../../../lib/format-money';
import { StickyAction } from '../../../components/ui';
import { AmountField, Field, PercentField } from '../../../components/bill/flow/Field';
import { FlowScreen } from '../../../components/bill/flow/FlowScreen';
import { Segmented } from '../../../components/bill/flow/Segmented';
import { ToggleRow } from '../../../components/bill/flow/ToggleRow';
import { adjustmentSummary } from '../../../components/bill/flow/adjustmentText';
import { rupeesErrorText } from '../../../components/bill/flow/messages';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { billHref } from '../../../components/bill/flow/nav';

type Kind = 'cardDiscount' | 'tax' | 'serviceCharge' | 'tip' | 'fee';
const KINDS: readonly Kind[] = ['cardDiscount', 'tax', 'serviceCharge', 'tip', 'fee'];
const ORDER: Record<Kind, number> = {
  cardDiscount: defaultOrders.discount,
  tax: defaultOrders.tax,
  serviceCharge: defaultOrders.serviceCharge,
  tip: defaultOrders.tip,
  fee: defaultOrders.fee,
};

type Described<K extends Kind> = Extract<PresetDescription, { kind: K }>;

interface Slot {
  id: AdjustmentId;
  order: number;
}

interface Form {
  discOn: boolean;
  discPct: string;
  discCap: string;
  discLabel?: string;
  /** Printed amounts from a scanned receipt; kept until the user edits that row's values (D3a). */
  discPrinted?: Paisa;
  taxOn: boolean;
  taxPct: string;
  taxBase: 'original' | 'after-discounts';
  taxLabel?: string;
  taxPrinted?: Paisa;
  svcOn: boolean;
  svcPct: string;
  svcLabel?: string;
  svcPrinted?: Paisa;
  tipOn: boolean;
  tipAmt: string;
  tipSplit: 'equal' | 'proportional';
  tipPrinted?: Paisa;
  feeOn: boolean;
  feeLabel: string;
  feeAmt: string;
  feePrinted?: Paisa;
}

function firstOf<K extends Kind>(adjs: readonly Adjustment[], kind: K) {
  for (const a of adjs) {
    const d = describeAdjustment(a);
    if (d.kind === kind) return { adj: a, d: d as Described<K> };
  }
  return undefined;
}

function seed(adjs: readonly Adjustment[]): { form: Form; slots: Record<Kind, Slot>; managed: Set<string> } {
  const disc = firstOf(adjs, 'cardDiscount');
  const tx = firstOf(adjs, 'tax');
  const svc = firstOf(adjs, 'serviceCharge');
  const tp = firstOf(adjs, 'tip');
  const fe = firstOf(adjs, 'fee');
  const found = { cardDiscount: disc?.adj, tax: tx?.adj, serviceCharge: svc?.adj, tip: tp?.adj, fee: fe?.adj };
  const slots = {} as Record<Kind, Slot>;
  const managed = new Set<string>();
  for (const k of KINDS) {
    const a = found[k];
    slots[k] = { id: a?.id ?? (randomUUID() as AdjustmentId), order: a?.order ?? ORDER[k] };
    if (a) managed.add(a.id);
  }
  const form: Form = {
    discOn: !!disc,
    discPct: disc ? formatBp(disc.d.rateBp) : '',
    discCap: disc?.d.capPaisa !== undefined ? toRupeeInputText(disc.d.capPaisa) : '',
    discLabel: disc?.d.label,
    discPrinted: disc?.d.printedAmount,
    taxOn: !!tx,
    taxPct: tx ? formatBp(tx.d.rateBp) : '',
    taxBase: tx?.d.base ?? 'original',
    taxLabel: tx?.d.label,
    taxPrinted: tx?.d.printedAmount,
    svcOn: !!svc,
    svcPct: svc ? formatBp(svc.d.rateBp) : '',
    svcLabel: svc?.d.label,
    svcPrinted: svc?.d.printedAmount,
    tipOn: !!tp,
    tipAmt: tp ? toRupeeInputText(tp.d.amount) : '',
    tipSplit: tp?.d.split ?? 'equal',
    tipPrinted: tp?.d.printedAmount,
    feeOn: !!fe,
    feeLabel: fe?.d.label ?? '',
    feeAmt: fe ? toRupeeInputText(fe.d.amount) : '',
    feePrinted: fe?.d.printedAmount,
  };
  return { form, slots, managed };
}

/** Pure: what the form means. Either the preset adjustments or the first problem to fix. */
function build(
  f: Form,
  slots: Record<Kind, Slot>,
): { ok: true; adjustments: Adjustment[] } | { ok: false; problem: string } {
  const out: Adjustment[] = [];
  const pct = (text: string, what: string): { bp: ReturnType<typeof toBasisPoints> } | { error: string } => {
    const r = parsePercentToBp(text);
    return r.ok ? { bp: toBasisPoints(r.bp) } : { error: text.trim() === '' ? `Enter the ${what} percentage` : percentErrorText(r.reason) };
  };
  if (f.discOn) {
    const p = pct(f.discPct, 'discount');
    if ('error' in p) return { ok: false, problem: p.error };
    let cap: Paisa | undefined;
    if (f.discCap.trim() !== '') {
      const c = parseRupees(f.discCap);
      if (!c.ok) return { ok: false, problem: `Discount cap: ${rupeesErrorText(c.reason)}` };
      cap = c.paisa;
    }
    out.push(
      cardDiscount(slots.cardDiscount.id, slots.cardDiscount.order, {
        rateBp: p.bp,
        ...(cap !== undefined ? { capPaisa: cap } : {}),
        ...(f.discLabel ? { label: f.discLabel } : {}),
        ...(f.discPrinted !== undefined ? { printedAmount: f.discPrinted } : {}),
      }),
    );
  }
  if (f.taxOn) {
    const p = pct(f.taxPct, 'tax');
    if ('error' in p) return { ok: false, problem: p.error };
    out.push(
      tax(slots.tax.id, slots.tax.order, {
        rateBp: p.bp,
        base: f.taxBase,
        ...(f.taxLabel ? { label: f.taxLabel } : {}),
        ...(f.taxPrinted !== undefined ? { printedAmount: f.taxPrinted } : {}),
      }),
    );
  }
  if (f.svcOn) {
    const p = pct(f.svcPct, 'service charge');
    if ('error' in p) return { ok: false, problem: p.error };
    out.push(
      serviceCharge(slots.serviceCharge.id, slots.serviceCharge.order, {
        rateBp: p.bp,
        ...(f.svcLabel ? { label: f.svcLabel } : {}),
        ...(f.svcPrinted !== undefined ? { printedAmount: f.svcPrinted } : {}),
      }),
    );
  }
  if (f.tipOn) {
    const a = parseRupees(f.tipAmt);
    if (!a.ok) return { ok: false, problem: `Tip: ${rupeesErrorText(a.reason)}` };
    out.push(tip(slots.tip.id, slots.tip.order, {
        amount: a.paisa,
        split: f.tipSplit,
        ...(f.tipPrinted !== undefined ? { printedAmount: f.tipPrinted } : {}),
      }));
  }
  if (f.feeOn) {
    const a = parseRupees(f.feeAmt);
    if (!a.ok) return { ok: false, problem: `Fee: ${rupeesErrorText(a.reason)}` };
    if (f.feeLabel.trim() === '') return { ok: false, problem: 'Give the fee a name' };
    out.push(fee(slots.fee.id, slots.fee.order, {
        amount: a.paisa,
        label: f.feeLabel.trim(),
        ...(f.feePrinted !== undefined ? { printedAmount: f.feePrinted } : {}),
      }));
  }
  return { ok: true, adjustments: out };
}

export default function ChargesScreen() {
  const { id, bill } = useBillRoute();
  if (!bill) return <BillNotFound />;
  return <ChargesForm id={id} initial={bill.adjustments} current={bill.adjustments} />;
}

function ChargesForm({
  id,
  initial,
  current,
}: {
  id: string;
  initial: readonly Adjustment[];
  current: readonly Adjustment[];
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [seeded] = useState(() => seed(initial));
  const { slots, managed } = seeded;
  const [form, setForm] = useState<Form>(seeded.form);
  const [focusKind, setFocusKind] = useState<Kind | null>(null);
  const first = useRef(true);

  const built = build(form, slots);
  const others = current.filter((a) => !managed.has(a.id));

  // Keep the store in step with the form whenever it is valid (the initial render changes nothing).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!built.ok) return;
    const live = splitrStore.getState().root.bills.find((b) => b.id === id);
    const keep = (live?.adjustments ?? []).filter((a) => !managed.has(a.id));
    splitrStore.getState().setAdjustments(id, [...keep, ...built.adjustments]);
  }, [form]);

  const set = (patch: Partial<Form>, kind?: Kind) => {
    if (kind) setFocusKind(kind);
    // D3a: editing a row's rate, base, amount or split drops its printed amount.
    const drops: Partial<Form> = {};
    if ('discPct' in patch || 'discCap' in patch) drops.discPrinted = undefined;
    if ('taxPct' in patch || 'taxBase' in patch) drops.taxPrinted = undefined;
    if ('svcPct' in patch) drops.svcPrinted = undefined;
    if ('tipAmt' in patch || 'tipSplit' in patch) drops.tipPrinted = undefined;
    if ('feeAmt' in patch || 'feeLabel' in patch) drops.feePrinted = undefined;
    setForm((f) => ({ ...f, ...patch, ...drops }));
  };

  const pctError = (text: string): string | undefined => {
    if (text.trim() === '') return undefined;
    const r = parsePercentToBp(text);
    return r.ok ? undefined : percentErrorText(r.reason);
  };
  const rupeeError = (text: string): string | undefined => {
    if (text.trim() === '') return undefined;
    const r = parseRupees(text);
    return r.ok ? undefined : rupeesErrorText(r.reason);
  };

  return (
    <FlowScreen
      footer={
        <View>
          {!built.ok ? (
            <View className="mx-4 mt-2 flex-row items-center gap-2">
              <Info size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              <Text className="flex-1 font-brico-bold text-body-small text-ink">{built.problem}</Text>
            </View>
          ) : null}
          <StickyAction
            label="See the split"
            accessibilityLabel="See the split"
            disabled={!built.ok}
            onPress={() => router.replace(billHref(id, 'breakdown'))}
          />
        </View>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-brico-medium text-body text-muted">
          Switch on what is on the receipt. Everything is optional.
        </Text>

        <ToggleRow
          title="Card discount"
          subtitle="Percent off the original bill"
          on={form.discOn}
          onChange={(on) => set({ discOn: on }, 'cardDiscount')}
        >
          <PercentField
            accessibilityLabel="Card discount percentage"
            placeholder="20"
            value={form.discPct}
            onChangeText={(t) => set({ discPct: t })}
            autoFocus={focusKind === 'cardDiscount'}
            error={pctError(form.discPct)}
          />
          <AmountField
            accessibilityLabel="Card discount cap in rupees, optional"
            placeholder="Cap (optional)"
            value={form.discCap}
            onChangeText={(t) => set({ discCap: t })}
            error={rupeeError(form.discCap)}
          />
        </ToggleRow>

        <ToggleRow
          title="Tax"
          subtitle="GST or sales tax"
          on={form.taxOn}
          onChange={(on) => set({ taxOn: on }, 'tax')}
        >
          <PercentField
            accessibilityLabel="Tax percentage"
            placeholder="5"
            value={form.taxPct}
            onChangeText={(t) => set({ taxPct: t })}
            autoFocus={focusKind === 'tax'}
            error={pctError(form.taxPct)}
          />
          <Segmented
            label="Tax is charged on"
            options={[
              { value: 'original', label: 'On the original bill' },
              { value: 'after-discounts', label: 'After discount' },
            ]}
            value={form.taxBase}
            onChange={(v) => set({ taxBase: v })}
          />
        </ToggleRow>

        <ToggleRow
          title="Service charge"
          subtitle="Percent of the bill"
          on={form.svcOn}
          onChange={(on) => set({ svcOn: on }, 'serviceCharge')}
        >
          <PercentField
            accessibilityLabel="Service charge percentage"
            placeholder="10"
            value={form.svcPct}
            onChangeText={(t) => set({ svcPct: t })}
            autoFocus={focusKind === 'serviceCharge'}
            error={pctError(form.svcPct)}
          />
        </ToggleRow>

        <ToggleRow
          title="Tip"
          subtitle="A fixed amount"
          on={form.tipOn}
          onChange={(on) => set({ tipOn: on }, 'tip')}
        >
          <AmountField
            accessibilityLabel="Tip amount in rupees"
            placeholder="0"
            value={form.tipAmt}
            onChangeText={(t) => set({ tipAmt: t })}
            autoFocus={focusKind === 'tip'}
            error={rupeeError(form.tipAmt)}
          />
          <Segmented
            label="Split the tip"
            options={[
              { value: 'equal', label: 'Equally' },
              { value: 'proportional', label: 'By what each ate' },
            ]}
            value={form.tipSplit}
            onChange={(v) => set({ tipSplit: v })}
          />
        </ToggleRow>

        <ToggleRow
          title="Fee"
          subtitle="Delivery, packing or anything else"
          on={form.feeOn}
          onChange={(on) => set({ feeOn: on }, 'fee')}
        >
          <Field
            accessibilityLabel="Fee name"
            placeholder="Name, e.g. Delivery"
            value={form.feeLabel}
            onChangeText={(t) => set({ feeLabel: t })}
            autoFocus={focusKind === 'fee'}
            autoCapitalize="sentences"
          />
          <AmountField
            accessibilityLabel="Fee amount in rupees"
            placeholder="0"
            value={form.feeAmt}
            onChangeText={(t) => set({ feeAmt: t })}
            error={rupeeError(form.feeAmt)}
          />
        </ToggleRow>

        {others.length > 0 ? (
          <View className="gap-2 pt-2">
            <Text className="font-brico-extrabold text-item-name text-ink">Other charges on this bill</Text>
            {others.map((a) => {
              const s = adjustmentSummary(a);
              return (
                <View key={a.id} className="flex-row items-center rounded-card bg-surface-2 pl-4">
                  <View className="flex-1 py-3">
                    <Text className="font-brico-bold text-body text-ink">{s.title}</Text>
                    <Text className="font-brico-medium text-body-small text-muted">{s.note}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${s.title}`}
                    onPress={() => {
                      const live = splitrStore.getState().root.bills.find((b) => b.id === id);
                      splitrStore.getState().setAdjustments(
                        id,
                        (live?.adjustments ?? []).filter((x) => x.id !== a.id),
                      );
                    }}
                    style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                    className="items-center justify-center active:opacity-pressed"
                  >
                    <Trash2 size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </FlowScreen>
  );
}
