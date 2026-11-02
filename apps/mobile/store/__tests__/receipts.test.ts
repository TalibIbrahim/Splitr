/**
 * Phase 2 store actions (docs/phase2-spec.md section 6.1), written from the spec only.
 * Conventions per docs/phase1-spec.md sections 4.1-4.2.
 */
import { describe, expect, it, vi } from 'vitest';
import { calculateBill } from '@splitr/calculation-engine';
import { toBillInput, cardDiscount, describeAdjustment, fee, serviceCharge, tax, tip } from '@splitr/bill-domain';
import type { Adjustment, Item } from '@splitr/calculation-engine';
import type { ReceiptDraft } from '@splitr/shared-types';
import * as selectors from '../selectors';
import {
  $,
  MemoryStorage,
  at,
  bill,
  bp,
  buildFixtureB,
  currentTransfers,
  expectStatusInvariant,
  expectValidRoot,
  makeEnv,
  payAll,
  ready,
  seedPeople,
  st,
} from './helpers';
import type { Env } from './helpers';

type Patch = Parameters<ReturnType<typeof st>['applyDraft']>[1];

const draft = (over: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  items: [],
  charges: [],
  checks: [],
  unparsedRows: [],
  ...over,
});

const rItem = (id: string, name: string, lineTotal: number, assignment: Item['assignment'] = { kind: 'unassigned' }): Item => ({
  id,
  name,
  quantity: 1,
  lineTotal: $(lineTotal),
  categories: [],
  assignment,
  source: 'receipt',
});

const patchOf = (p: Partial<Patch> = {}): Patch => ({ items: [], adjustments: [], notes: [], ...p }) as Patch;

function simpleBill(e: Env): string {
  const people = seedPeople(e);
  const id = st(e).createBill({
    groupId: null,
    restaurantName: 'Old Place',
    date: '2026-01-01',
    participantPersonIds: [people.me, people.hamza],
    guests: [],
  });
  st(e).addItem(id, { name: 'Existing A', quantity: 1, lineTotal: $(100000) });
  st(e).addItem(id, { name: 'Existing B', quantity: 1, lineTotal: $(50000) });
  return id;
}

describe('§6.1 attachReceipt', () => {
  it('§6.1 attachReceipt sets bill.receipt = { imageUri, scannedAt: now(), draft }', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    e.advance(5000);
    const d = draft({ restaurantName: 'Salt', printedTotal: $(123400) });
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: d });
    expect(bill(e, id).receipt).toEqual({ imageUri: 'file:///r/a.jpg', scannedAt: e.now(), draft: d });
    expectValidRoot(e);
  });

  it('§6.1 attachReceipt accepts draft: null', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    expect(bill(e, id).receipt).toEqual({ imageUri: 'file:///r/a.jpg', scannedAt: e.now(), draft: null });
  });

  it('§6.1 attachReceipt with the same uri replaces the draft (and scannedAt = now)', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: draft({ restaurantName: 'First' }) });
    e.advance(60000);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    expect(bill(e, id).receipt).toMatchObject({ imageUri: 'file:///r/a.jpg', draft: null });
    expect(bill(e, id).receipt?.moreImageUris ?? []).toEqual([]);
  });

  it('§6.1 v1.2 attachReceipt with a different uri keeps the first imageUri, appends to moreImageUris, replaces the draft', () => {
    // (supersedes the v1.0 "replaces an earlier receipt" test; scannedAt on append is unspecified, so not asserted)
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: draft({ restaurantName: 'First' }) });
    e.advance(90000);
    const d2 = draft({ restaurantName: 'Second', printedTotal: $(5000) });
    st(e).attachReceipt(id, { imageUri: 'file:///r/b.jpg', draft: d2 });
    const r = bill(e, id).receipt;
    expect(r?.imageUri).toBe('file:///r/a.jpg');
    expect(r?.moreImageUris).toEqual(['file:///r/b.jpg']);
    expect(r?.draft).toEqual(d2);
    expect(r?.scannedAt).toBe(e.now());
    expectValidRoot(e);
  });

  it('§6.1 v1.2 attachReceipt appends further different uris in order', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    st(e).attachReceipt(id, { imageUri: 'file:///r/b.jpg', draft: null });
    st(e).attachReceipt(id, { imageUri: 'file:///r/c.jpg', draft: null });
    const r = bill(e, id).receipt;
    expect(r?.imageUri).toBe('file:///r/a.jpg');
    expect(r?.moreImageUris).toEqual(['file:///r/b.jpg', 'file:///r/c.jpg']);
  });

  it('§6.1 v1.2 a uri that already exists (main or extra) is never added again; only draft and scannedAt change', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    st(e).attachReceipt(id, { imageUri: 'file:///r/b.jpg', draft: null });
    e.advance(30000);
    const d = draft({ restaurantName: 'Again' });
    st(e).attachReceipt(id, { imageUri: 'file:///r/b.jpg', draft: d }); // existing extra
    let r = bill(e, id).receipt;
    expect(r?.imageUri).toBe('file:///r/a.jpg');
    expect(r?.moreImageUris).toEqual(['file:///r/b.jpg']);
    expect(r?.draft).toEqual(d);
    expect(r?.scannedAt).toBe(e.now());
    e.advance(30000);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null }); // existing main
    r = bill(e, id).receipt;
    expect(r?.imageUri).toBe('file:///r/a.jpg');
    expect(r?.moreImageUris).toEqual(['file:///r/b.jpg']);
    expect(r?.draft).toBeNull();
    expect(r?.scannedAt).toBe(e.now());
  });

  it('§6.1 v1.2 a first attachReceipt has no extra images', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    expect(bill(e, id).receipt?.moreImageUris ?? []).toEqual([]);
  });

  it('§6.1 attachReceipt bumps updatedAt and leaves items untouched', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    const before = bill(e, id);
    e.advance(1000);
    st(e).attachReceipt(id, { imageUri: 'file:///r/a.jpg', draft: null });
    const after = bill(e, id);
    expect(after.updatedAt).toBe(e.now());
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(after.items).toEqual(before.items);
  });

  it('§6.1 attachReceipt is a no-op on an unknown bill', () => {
    const e = makeEnv();
    simpleBill(e);
    const before = JSON.stringify(st(e).root);
    expect(() => st(e).attachReceipt('nope', { imageUri: 'file:///x.jpg', draft: null })).not.toThrow();
    expect(JSON.stringify(st(e).root)).toBe(before);
  });

  it('§6.1 attachReceipt is a no-op on a settled bill (read-only)', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).assignRemaining(id);
    st(e).setContributions(id, [{ participantId: at(bill(e, id).participants, 0).id, amount: $(150000) }]);
    for (const t of currentTransfers(bill(e, id))) st(e).setTransferPaid(id, t.from, t.to, true);
    expect(st(e).settle(id).ok).toBe(true);
    expect(bill(e, id).status).toBe('settled');
    const before = JSON.stringify(bill(e, id));
    st(e).attachReceipt(id, { imageUri: 'file:///x.jpg', draft: null });
    expect(JSON.stringify(bill(e, id))).toBe(before);
    expect(bill(e, id).receipt).toBeUndefined();
  });
});

describe('§6.1 applyDraft items', () => {
  it('§6.1 applyDraft replaceItems:true → items = patch.items', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    const patch = patchOf({ items: [rItem('p1', 'Biryani', 90000), rItem('p2', 'Raita', 20000)] });
    st(e).applyDraft(id, patch, { replaceItems: true });
    expect(bill(e, id).items).toEqual(patch.items);
  });

  it('§6.1 applyDraft replaceItems:false → [...existing, ...patch.items] in that order', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    const existing = bill(e, id).items;
    const patch = patchOf({ items: [rItem('p1', 'Biryani', 90000), rItem('p2', 'Raita', 20000)] });
    st(e).applyDraft(id, patch, { replaceItems: false });
    expect(bill(e, id).items).toEqual([...existing, ...patch.items]);
    expect(bill(e, id).items.map((i) => i.name)).toEqual(['Existing A', 'Existing B', 'Biryani', 'Raita']);
  });

  it('§6.1 applyDraft keeps patch item fields (source receipt, unassigned) and the result stays schema-valid', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).applyDraft(id, patchOf({ items: [rItem('p1', 'Biryani', 90000)] }), { replaceItems: true });
    const i = at(bill(e, id).items, 0);
    expect(i.source).toBe('receipt');
    expect(i.assignment).toEqual({ kind: 'unassigned' });
    expectValidRoot(e);
  });

  it('§6.1 applyDraft with empty patch and replaceItems:true empties the items', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).applyDraft(id, patchOf(), { replaceItems: true });
    expect(bill(e, id).items).toEqual([]);
  });

  it('§6.1 applyDraft with empty patch and replaceItems:false changes nothing material', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    const before = bill(e, id);
    st(e).applyDraft(id, patchOf(), { replaceItems: false });
    const after = bill(e, id);
    expect(after.items).toEqual(before.items);
    expect(after.adjustments).toEqual(before.adjustments);
    expect(after.restaurantName).toBe(before.restaurantName);
    expect(after.date).toBe(before.date);
  });

  it('§6.1 applyDraft bumps updatedAt', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    e.advance(7000);
    st(e).applyDraft(id, patchOf({ items: [rItem('p1', 'X', 1000)] }), { replaceItems: false });
    expect(bill(e, id).updatedAt).toBe(e.now());
  });

  it('§6.1 applyDraft is a no-op on an unknown bill', () => {
    const e = makeEnv();
    simpleBill(e);
    const before = JSON.stringify(st(e).root);
    expect(() => st(e).applyDraft('nope', patchOf({ items: [rItem('p1', 'X', 1000)] }), { replaceItems: true })).not.toThrow();
    expect(JSON.stringify(st(e).root)).toBe(before);
  });

  it('§6.1 applyDraft is a no-op on a settled bill', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).assignRemaining(id);
    st(e).setContributions(id, [{ participantId: at(bill(e, id).participants, 0).id, amount: $(150000) }]);
    for (const t of currentTransfers(bill(e, id))) st(e).setTransferPaid(id, t.from, t.to, true);
    expect(st(e).settle(id).ok).toBe(true);
    const before = JSON.stringify(bill(e, id));
    st(e).applyDraft(
      id,
      patchOf({ items: [rItem('p1', 'X', 1000)], adjustments: [cardDiscount('pa', 10, { rateBp: bp(1000) })], printedTotal: $(5) }),
      { replaceItems: true, restaurantName: 'New', date: '2026-02-02' },
    );
    expect(JSON.stringify(bill(e, id))).toBe(before);
  });
});

describe('§6.1 applyDraft adjustments', () => {
  const setup = () => {
    const e = makeEnv();
    const id = simpleBill(e);
    return { e, id };
  };

  it('§6.1 applyDraft appends patch adjustments after existing ones of other kinds', () => {
    const { e, id } = setup();
    const existingTax = tax('old-tax', 30, { rateBp: bp(500), base: 'original' });
    st(e).setAdjustments(id, [existingTax]);
    const disc = cardDiscount('new-disc', 10, { rateBp: bp(2000) });
    st(e).applyDraft(id, patchOf({ adjustments: [disc] }), { replaceItems: false });
    expect(bill(e, id).adjustments).toEqual([existingTax, disc]);
  });

  it('§6.1 applyDraft replaces an existing card discount with the patch card discount (same preset kind)', () => {
    const { e, id } = setup();
    const oldDisc = cardDiscount('old-disc', 10, { rateBp: bp(2000) });
    const oldTax = tax('old-tax', 30, { rateBp: bp(500), base: 'original' });
    st(e).setAdjustments(id, [oldDisc, oldTax]);
    const newDisc = cardDiscount('new-disc', 10, { rateBp: bp(1500), label: 'HBL 15%' });
    st(e).applyDraft(id, patchOf({ adjustments: [newDisc] }), { replaceItems: false });
    const adjs = bill(e, id).adjustments;
    expect(adjs.find((a) => a.id === 'old-disc')).toBeUndefined();
    expect(adjs.find((a) => a.id === 'new-disc')).toEqual(newDisc);
    expect(adjs.find((a) => a.id === 'old-tax')).toEqual(oldTax);
    expect(adjs).toHaveLength(2);
  });

  it('§6.1 applyDraft replaces same-kind adjustments per kind: tax with tax, service with service, tip with tip', () => {
    const { e, id } = setup();
    st(e).setAdjustments(id, [
      tax('t-old', 30, { rateBp: bp(500), base: 'original' }),
      serviceCharge('s-old', 20, { rateBp: bp(1000) }),
      tip('tip-old', 40, { amount: $(1000), split: 'equal' }),
    ]);
    const nt = tax('t-new', 30, { rateBp: bp(1600), base: 'original', label: 'GST 16%' });
    const ns = serviceCharge('s-new', 20, { rateBp: bp(500) });
    const ntip = tip('tip-new', 40, { amount: $(2000), split: 'proportional' });
    st(e).applyDraft(id, patchOf({ adjustments: [nt, ns, ntip] }), { replaceItems: false });
    const ids = bill(e, id).adjustments.map((a) => a.id).sort();
    expect(ids).toEqual(['s-new', 't-new', 'tip-new']);
  });

  it('§6.1 applyDraft keeps custom adjustments (no preset kind to match)', () => {
    const { e, id } = setup();
    const custom: Adjustment = {
      id: 'cust',
      label: 'Corkage',
      kind: 'custom',
      direction: 'add',
      value: { type: 'fixed', amount: $(30000) },
      order: 60,
      source: 'user',
    };
    expect(describeAdjustment(custom).kind).toBe('custom');
    st(e).setAdjustments(id, [custom]);
    const disc = cardDiscount('new-disc', 10, { rateBp: bp(1000) });
    st(e).applyDraft(id, patchOf({ adjustments: [disc] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id).sort()).toEqual(['cust', 'new-disc']);
    expect(bill(e, id).adjustments.find((a) => a.id === 'cust')).toEqual(custom);
  });

  const fixedOf = (id: string, kind: 'tax' | 'discount' | 'serviceCharge', amount: number, direction?: 'add' | 'subtract'): Adjustment =>
    ({
      id,
      label: `Fixed ${kind}`,
      kind,
      ...(direction ? { direction } : {}),
      value: { type: 'fixed', amount: $(amount) },
      order: kind === 'tax' ? 30 : kind === 'discount' ? 10 : 20,
      source: 'reconciliation',
    }) as Adjustment;

  it('§6.1 applyDraft: a fixed-value tax in the patch replaces an existing 16% rate tax (replace by engine kind)', () => {
    const { e, id } = setup();
    const rate = tax('t-rate', 30, { rateBp: bp(1600), base: 'original' });
    st(e).setAdjustments(id, [rate]);
    const fixed = fixedOf('t-fixed', 'tax', 34000);
    st(e).applyDraft(id, patchOf({ adjustments: [fixed] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id)).toEqual(['t-fixed']);
  });

  it('§6.1 applyDraft: a 16% rate tax in the patch replaces an existing fixed-value tax', () => {
    const { e, id } = setup();
    st(e).setAdjustments(id, [fixedOf('t-fixed', 'tax', 34000)]);
    const rate = tax('t-rate', 30, { rateBp: bp(1600), base: 'original' });
    st(e).applyDraft(id, patchOf({ adjustments: [rate] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id)).toEqual(['t-rate']);
  });

  it('§6.1 applyDraft: a fixed discount in the patch replaces an existing card-discount rate adjustment', () => {
    const { e, id } = setup();
    st(e).setAdjustments(id, [cardDiscount('d-rate', 10, { rateBp: bp(2000) })]);
    st(e).applyDraft(id, patchOf({ adjustments: [fixedOf('d-fixed', 'discount', 5000)] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id)).toEqual(['d-fixed']);
  });

  it('§6.1 applyDraft: a fixed service charge replaces an existing rate service charge, other kinds untouched', () => {
    const { e, id } = setup();
    const t = tax('t', 30, { rateBp: bp(500), base: 'original' });
    st(e).setAdjustments(id, [serviceCharge('s-rate', 20, { rateBp: bp(1000) }), t]);
    st(e).applyDraft(id, patchOf({ adjustments: [fixedOf('s-fixed', 'serviceCharge', 7000)] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id).sort()).toEqual(['s-fixed', 't']);
  });

  it('§6.1 applyDraft keeps an existing fee and custom, and appends the patch fee (fee is never replaced)', () => {
    const { e, id } = setup();
    const oldFee = fee('fee-old', 50, { amount: $(10000), label: 'Cover' });
    const custom: Adjustment = {
      id: 'cust',
      label: 'Corkage',
      kind: 'custom',
      direction: 'add',
      value: { type: 'fixed', amount: $(30000) },
      order: 60,
      source: 'user',
    };
    st(e).setAdjustments(id, [oldFee, custom]);
    const newFee = fee('fee-new', 50, { amount: $(20000), label: 'Packing' });
    st(e).applyDraft(id, patchOf({ adjustments: [newFee] }), { replaceItems: false });
    const adjs = bill(e, id).adjustments;
    expect(adjs.map((a) => a.id).sort()).toEqual(['cust', 'fee-new', 'fee-old']);
    expect(adjs.find((a) => a.id === 'fee-old')).toEqual(oldFee);
    expect(adjs.find((a) => a.id === 'cust')).toEqual(custom);
    expect(adjs.find((a) => a.id === 'fee-new')).toEqual(newFee);
  });

  it('§6.1 applyDraft appends a custom patch adjustment without replacing an existing custom', () => {
    const { e, id } = setup();
    const mkCustom = (cid: string): Adjustment => ({
      id: cid,
      label: cid,
      kind: 'custom',
      direction: 'add',
      value: { type: 'fixed', amount: $(1000) },
      order: 60,
      source: 'user',
    });
    st(e).setAdjustments(id, [mkCustom('c1')]);
    st(e).applyDraft(id, patchOf({ adjustments: [mkCustom('c2')] }), { replaceItems: false });
    expect(bill(e, id).adjustments.map((a) => a.id).sort()).toEqual(['c1', 'c2']);
  });

  const customTaxAfter = (include: string[] | 'all-prior'): Adjustment => ({
    id: 'ctax',
    label: 'Service tax',
    kind: 'custom',
    direction: 'add',
    value: { type: 'rate', bp: bp(500) },
    base: { type: 'items-after', include: include as never },
    order: 60,
    allocation: { type: 'proportional' },
    source: 'user',
  });

  it('§6.1 strip-ids applyDraft strips removed adjustment ids from remaining items-after includes; calculateBill stays valid', () => {
    const { e, id } = setup();
    st(e).assignRemaining(id);
    st(e).setAdjustments(id, [cardDiscount('old-disc', 10, { rateBp: bp(2000) }), customTaxAfter(['old-disc'])]);
    const newDisc = cardDiscount('new-disc', 10, { rateBp: bp(1000) });
    st(e).applyDraft(id, patchOf({ adjustments: [newDisc] }), { replaceItems: false });
    const adjs = bill(e, id).adjustments;
    expect(adjs.map((a) => a.id).sort()).toEqual(['ctax', 'new-disc']);
    const ct = adjs.find((a) => a.id === 'ctax');
    const base = ct?.base as { type: string; include?: unknown } | undefined;
    if (base?.type === 'items-after') expect(base.include).not.toContain('old-disc');
    const r = calculateBill(toBillInput(bill(e, id)));
    const codes = r.ok ? [] : JSON.stringify(r);
    expect(codes).not.toContain('INVALID_INPUT');
    expect(r.ok).toBe(true);
  });

  it('§6.1 strip-ids a kind-tax adjustment stays when the patch has only a discount, and its include becomes [svc]', () => {
    const { e, id } = setup();
    st(e).assignRemaining(id);
    const svc = serviceCharge('svc', 20, { rateBp: bp(1000) });
    const gst: Adjustment = { ...tax('gst', 30, { rateBp: bp(1600), base: 'original' }), base: { type: 'items-after', include: ['old-disc', 'svc'] } };
    st(e).setAdjustments(id, [cardDiscount('old-disc', 10, { rateBp: bp(2000) }), svc, gst]);
    st(e).applyDraft(id, patchOf({ adjustments: [cardDiscount('new-disc', 10, { rateBp: bp(1000) })] }), { replaceItems: false });
    const adjs = bill(e, id).adjustments;
    expect(adjs.map((a) => a.id).sort()).toEqual(['gst', 'new-disc', 'svc']);
    expect(adjs.find((a) => a.id === 'gst')?.base).toEqual({ type: 'items-after', include: ['svc'] });
    expect(adjs.find((a) => a.id === 'gst')?.kind).toBe('tax');
    const r = calculateBill(toBillInput(bill(e, id)));
    expect(r.ok).toBe(true);
    expect(r.ok ? '' : JSON.stringify(r)).not.toContain('INVALID_INPUT');
  });

  it('§6.1 strip-ids an items-after include list that becomes empty switches to base { type: items }', () => {
    const { e, id } = setup();
    st(e).assignRemaining(id);
    st(e).setAdjustments(id, [cardDiscount('old-disc', 10, { rateBp: bp(2000) }), customTaxAfter(['old-disc'])]);
    st(e).applyDraft(id, patchOf({ adjustments: [cardDiscount('new-disc', 10, { rateBp: bp(1000) })] }), { replaceItems: false });
    expect(bill(e, id).adjustments.find((a) => a.id === 'ctax')?.base).toEqual({ type: 'items' });
    expect(calculateBill(toBillInput(bill(e, id))).ok).toBe(true);
  });

  it('§6.1 strip-ids a partly-stripped include list keeps the surviving ids', () => {
    const { e, id } = setup();
    const keepFee = fee('keep-fee', 5, { amount: $(1000), label: 'Cover' });
    st(e).setAdjustments(id, [keepFee, cardDiscount('old-disc', 10, { rateBp: bp(2000) }), customTaxAfter(['old-disc', 'keep-fee'])]);
    st(e).applyDraft(id, patchOf({ adjustments: [cardDiscount('new-disc', 10, { rateBp: bp(1000) })] }), { replaceItems: false });
    expect(bill(e, id).adjustments.find((a) => a.id === 'ctax')?.base).toEqual({ type: 'items-after', include: ['keep-fee'] });
  });

  it('§6.1 strip-ids an all-prior items-after base is untouched when adjustments are removed', () => {
    const { e, id } = setup();
    st(e).setAdjustments(id, [cardDiscount('old-disc', 10, { rateBp: bp(2000) }), customTaxAfter('all-prior')]);
    st(e).applyDraft(id, patchOf({ adjustments: [cardDiscount('new-disc', 10, { rateBp: bp(1000) })] }), { replaceItems: false });
    expect(bill(e, id).adjustments.find((a) => a.id === 'ctax')?.base).toEqual({ type: 'items-after', include: 'all-prior' });
  });

  it('§6.1 applyDraft with no patch adjustments keeps all existing adjustments', () => {
    const { e, id } = setup();
    const existing = [cardDiscount('d', 10, { rateBp: bp(2000) }), tax('t', 30, { rateBp: bp(500), base: 'original' })];
    st(e).setAdjustments(id, existing);
    st(e).applyDraft(id, patchOf({ items: [rItem('p1', 'X', 1000)] }), { replaceItems: true });
    expect(bill(e, id).adjustments).toEqual(existing);
  });

  it('§6.1 applyDraft appends patch adjustments when the bill has none', () => {
    const { e, id } = setup();
    const a = [cardDiscount('d', 10, { rateBp: bp(2000) }), tax('t', 30, { rateBp: bp(500), base: 'original' })];
    st(e).applyDraft(id, patchOf({ adjustments: a }), { replaceItems: false });
    expect(bill(e, id).adjustments).toEqual(a);
  });
});

describe('§6.1 applyDraft printed totals and meta', () => {
  it('§6.1 applyDraft sets printedSubtotal and printedTotal from the patch when present', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).applyDraft(id, patchOf({ printedSubtotal: $(150000), printedTotal: $(180000) }), { replaceItems: false });
    expect(bill(e, id).printedSubtotal).toBe(150000);
    expect(bill(e, id).printedTotal).toBe(180000);
  });

  it('§6.1 applyDraft leaves existing printed totals alone when the patch has none', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).updateBillMeta(id, { printedTotal: $(999900), printedSubtotal: $(888800) });
    st(e).applyDraft(id, patchOf({ items: [rItem('p1', 'X', 1000)] }), { replaceItems: false });
    expect(bill(e, id).printedTotal).toBe(999900);
    expect(bill(e, id).printedSubtotal).toBe(888800);
  });

  it('§6.1 applyDraft sets only the printed value the patch carries', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).updateBillMeta(id, { printedTotal: $(999900), printedSubtotal: $(888800) });
    st(e).applyDraft(id, patchOf({ printedTotal: $(1234) }), { replaceItems: false });
    expect(bill(e, id).printedTotal).toBe(1234);
    expect(bill(e, id).printedSubtotal).toBe(888800);
  });

  it('§6.1 applyDraft applies restaurantName and date only when passed', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).applyDraft(id, patchOf(), { replaceItems: false });
    expect(bill(e, id).restaurantName).toBe('Old Place');
    expect(bill(e, id).date).toBe('2026-01-01');
    st(e).applyDraft(id, patchOf(), { replaceItems: false, restaurantName: 'Salt & Ember' });
    expect(bill(e, id).restaurantName).toBe('Salt & Ember');
    expect(bill(e, id).date).toBe('2026-01-01');
    st(e).applyDraft(id, patchOf(), { replaceItems: false, date: '2026-11-02' });
    expect(bill(e, id).restaurantName).toBe('Salt & Ember');
    expect(bill(e, id).date).toBe('2026-11-02');
  });

  it('§6.1 applyDraft applies both restaurantName and date when both passed', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).applyDraft(id, patchOf(), { replaceItems: true, restaurantName: 'Kolachi', date: '2026-03-04' });
    expect(bill(e, id).restaurantName).toBe('Kolachi');
    expect(bill(e, id).date).toBe('2026-03-04');
  });

  it('§6.1 applyDraft does not touch the attached receipt', () => {
    const e = makeEnv();
    const id = simpleBill(e);
    st(e).attachReceipt(id, { imageUri: 'file:///a.jpg', draft: null });
    const r = bill(e, id).receipt;
    st(e).applyDraft(id, patchOf({ items: [rItem('p1', 'X', 1000)] }), { replaceItems: true });
    expect(bill(e, id).receipt).toEqual(r);
  });
});

describe('§6.1 applyDraft reconciliation (phase 1 section 4.1 invariant, S7 notice)', () => {
  it('§6.1 applyDraft keeps transferStatuses mirroring current transfers', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const everyone = Object.values(f.people);
    st(e).applyDraft(
      f.billId,
      patchOf({ items: [rItem('p1', 'Extra', 50000, { kind: 'equal', participantIds: everyone })] }),
      { replaceItems: false },
    );
    expectStatusInvariant(bill(e, f.billId));
    expectValidRoot(e);
  });

  it('§6.1 applyDraft that changes amounts resets paid ticks and raises the payments-reset notice', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    payAll(e, f.billId);
    const paid = bill(e, f.billId).transferStatuses.filter((s) => s.status === 'paid').length;
    expect(paid).toBeGreaterThan(0);
    const everyone = Object.values(f.people);
    st(e).applyDraft(
      f.billId,
      patchOf({ items: [rItem('p1', 'Extra', 50000, { kind: 'equal', participantIds: everyone })] }),
      { replaceItems: false },
    );
    const b = bill(e, f.billId);
    expectStatusInvariant(b);
    expect(b.transferStatuses.filter((s) => s.status === 'paid')).toHaveLength(0);
    const n = selectors.selectNotice()(st(e));
    expect(n).toMatchObject({ kind: 'payments-reset', billId: f.billId });
    expect(n && 'count' in n ? n.count : 0).toBe(paid);
  });

  it('§6.1 applyDraft that changes nothing about amounts keeps paid ticks and raises no notice', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    payAll(e, f.billId);
    const before = bill(e, f.billId).transferStatuses;
    st(e).dismissNotice();
    st(e).applyDraft(f.billId, patchOf(), { replaceItems: false, restaurantName: 'Renamed' });
    expect(bill(e, f.billId).transferStatuses).toEqual(before);
    expect(selectors.selectNotice()(st(e)) ?? null).toBeNull();
  });
});

describe('§6.1 deleteReceiptFile / purgeDeletedReceipts', () => {
  const MIN = 60_000;

  function threeBills(e: Env) {
    const people = seedPeople(e);
    const mk = (name: string) =>
      st(e).createBill({ groupId: null, restaurantName: name, date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    const old = mk('old');
    const recent = mk('recent');
    const live = mk('live');
    st(e).attachReceipt(old, { imageUri: 'file:///old.jpg', draft: null });
    st(e).attachReceipt(recent, { imageUri: 'file:///recent.jpg', draft: null });
    st(e).attachReceipt(live, { imageUri: 'file:///live.jpg', draft: null });
    e.advance(MIN);
    st(e).deleteBill(old);
    e.advance(10 * MIN);
    st(e).deleteBill(recent);
    return { old, recent, live };
  }

  it('§6.1 deleting a bill does not call deleteReceiptFile by itself (undo window)', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    threeBills(e);
    expect(spy).not.toHaveBeenCalled();
  });

  it('§6.1 purgeDeletedReceipts(olderThan) deletes the file of bills deleted before the cutoff, exactly once', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    threeBills(e);
    const cutoff = new Date(Date.parse(e.now()) - 5 * MIN).toISOString(); // between the two deletions
    st(e).purgeDeletedReceipts(cutoff);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('file:///old.jpg');
  });

  it('§6.1 purgeDeletedReceipts never deletes the receipt of a live bill, even with a far-future cutoff', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    threeBills(e);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) + 365 * 24 * 60 * MIN).toISOString());
    const uris = spy.mock.calls.map((c) => c[0] as string);
    expect(uris).not.toContain('file:///live.jpg');
    expect([...uris].sort()).toEqual(['file:///old.jpg', 'file:///recent.jpg']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('§6.1 purgeDeletedReceipts does not delete bills deleted after the cutoff', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    threeBills(e);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) - 60 * MIN).toISOString()); // before both deletions
    expect(spy).not.toHaveBeenCalled();
  });

  it('§6.1 purgeDeletedReceipts skips deleted bills that have no receipt', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    const people = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'x', date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    st(e).deleteBill(id);
    e.advance(MIN);
    st(e).purgeDeletedReceipts(e.now());
    expect(spy).not.toHaveBeenCalled();
  });

  it('§6.1 a restored bill keeps its receipt file (restore clears deletedAt, purge skips it)', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    const { old } = threeBills(e);
    st(e).restoreBill(old);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) + 60 * MIN).toISOString());
    expect(spy.mock.calls.map((c) => c[0])).not.toContain('file:///old.jpg');
  });

  it('§6.1 purgeDeletedReceipts a second time does not call deleteReceiptFile again for the same receipt (call counts only)', () => {
    // AMBIGUITY: the spec does not say whether bill.receipt is cleared after a purge; only call counts are asserted.
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    threeBills(e);
    const cutoff = new Date(Date.parse(e.now()) - 5 * MIN).toISOString();
    st(e).purgeDeletedReceipts(cutoff);
    expect(spy).toHaveBeenCalledTimes(1);
    st(e).purgeDeletedReceipts(cutoff);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('§6.1 purgeDeletedReceipts does not throw when deleteReceiptFile is not provided', () => {
    const e = makeEnv();
    threeBills(e);
    expect(() => st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) + 60 * MIN).toISOString())).not.toThrow();
    expectValidRoot(e);
  });

  it('§6.1 purgeDeletedReceipts removes bill.receipt after calling deleteReceiptFile (v1.1 ruling 1)', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    const { old, recent, live } = threeBills(e);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) - 5 * MIN).toISOString());
    expect(bill(e, old).receipt).toBeUndefined();
    expect(bill(e, recent).receipt).toMatchObject({ imageUri: 'file:///recent.jpg' });
    expect(bill(e, live).receipt).toMatchObject({ imageUri: 'file:///live.jpg' });
    expectValidRoot(e);
  });

  it('§6.1 v1.2 purgeDeletedReceipts calls deleteReceiptFile once per file (main + each extra), then removes the receipt', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    const people = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'x', date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    const live = st(e).createBill({ groupId: null, restaurantName: 'y', date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    for (const u of ['a', 'b', 'c']) st(e).attachReceipt(id, { imageUri: `file:///m/${u}.jpg`, draft: null });
    st(e).attachReceipt(live, { imageUri: 'file:///m/live.jpg', draft: null });
    st(e).attachReceipt(live, { imageUri: 'file:///m/live2.jpg', draft: null });
    e.advance(MIN);
    st(e).deleteBill(id);
    e.advance(MIN);
    st(e).purgeDeletedReceipts(e.now());
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls.map((c) => c[0] as string).sort()).toEqual(['file:///m/a.jpg', 'file:///m/b.jpg', 'file:///m/c.jpg']);
    expect(bill(e, id).receipt).toBeUndefined();
    expect(bill(e, live).receipt?.moreImageUris).toEqual(['file:///m/live2.jpg']);
    st(e).purgeDeletedReceipts(e.now());
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('§6.1 v1.2 purgeDeletedReceipts with extra images and no deleteReceiptFile does not throw and removes the receipt', () => {
    const e = makeEnv();
    const people = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'x', date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    st(e).attachReceipt(id, { imageUri: 'file:///m/a.jpg', draft: null });
    st(e).attachReceipt(id, { imageUri: 'file:///m/b.jpg', draft: null });
    e.advance(MIN);
    st(e).deleteBill(id);
    e.advance(MIN);
    expect(() => st(e).purgeDeletedReceipts(e.now())).not.toThrow();
    expect(bill(e, id).receipt).toBeUndefined();
  });

  it('§6.1 purgeDeletedReceipts removes bill.receipt even when deleteReceiptFile is not provided', () => {
    const e = makeEnv();
    const { old } = threeBills(e);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) + 60 * MIN).toISOString());
    expect(bill(e, old).receipt).toBeUndefined();
  });

  it('§6.1 purgeDeletedReceipts cutoff is strict: a bill deleted exactly at the cutoff is not purged', () => {
    const spy = vi.fn();
    const e = makeEnv({ deleteReceiptFile: spy });
    const people = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'x', date: '2026-11-02', participantPersonIds: [people.me], guests: [] });
    st(e).attachReceipt(id, { imageUri: 'file:///edge.jpg', draft: null });
    e.advance(MIN);
    st(e).deleteBill(id);
    const deletedAt = bill(e, id).deletedAt as string;
    expect(deletedAt).toBe(e.now());
    st(e).purgeDeletedReceipts(deletedAt);
    expect(spy).not.toHaveBeenCalled();
    expect(bill(e, id).receipt).toMatchObject({ imageUri: 'file:///edge.jpg' });
    st(e).purgeDeletedReceipts(new Date(Date.parse(deletedAt) + 1).toISOString());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('file:///edge.jpg');
  });

  it('§6.1 confirmRecovery deletes no receipt files (v1.1 ruling 4)', async () => {
    const spy = vi.fn();
    const storage = new MemoryStorage();
    storage.map.set('splitr-root', '{not valid json');
    const e = makeEnv({ storage, deleteReceiptFile: spy });
    await ready(e);
    st(e).confirmRecovery();
    expect(spy).not.toHaveBeenCalled();
  });

  it('§6.1 purgeDeletedReceipts does not remove the bills themselves (soft delete stays)', () => {
    const e = makeEnv({ deleteReceiptFile: vi.fn() });
    const { old } = threeBills(e);
    st(e).purgeDeletedReceipts(new Date(Date.parse(e.now()) + 60 * MIN).toISOString());
    expect(bill(e, old).deletedAt).toBeTruthy();
  });
});
