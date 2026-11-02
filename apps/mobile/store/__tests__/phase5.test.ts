/**
 * Phase 5 store tests (docs/phase5-spec.md section 4): card labels, user offers, selectors, persistence, backup.
 * Written from the spec only.
 *
 * Assumed shapes (single place to change each):
 *  - actions: addCardLabel(label) -> id ('' when ignored), removeCardLabel(id),
 *    addUserOffer(offer) -> id (starts 'user-'), removeUserOffer(id).
 *  - selectors (curried like the others): selectCardLabels()(state), selectAllOffers()(state).
 *  - root.cards / root.userOffers are optional.
 */
import { lahoreOffers } from '@splitr/offers-data';
import { PersistedRootSchema } from '@splitr/shared-types';
import type { CardOffer, PersistedRoot } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import * as backup from '../backup';
import * as selectors from '../selectors';
import { MemoryStorage, flush, makeEnv, ready, root, st, T0 } from './helpers';
import type { Env } from './helpers';

// ───────────── adapters ─────────────

type OfferInput = Omit<CardOffer, 'id' | 'source'> & { note?: string };
interface P5Actions {
  addCardLabel(label: string): string;
  removeCardLabel(id: string): unknown;
  addUserOffer(offer: OfferInput): string;
  removeUserOffer(id: string): unknown;
  restoreBackup(root: PersistedRoot, mode: 'replace' | 'merge'): unknown;
}
const act = (e: Env): P5Actions => st(e) as unknown as P5Actions;
interface P5Root {
  cards?: { id: string; label: string }[];
  userOffers?: CardOffer[];
}
const r5 = (e: Env): P5Root => root(e) as unknown as P5Root;

const callSel = (name: string, e: Env): unknown => {
  const fn = (selectors as unknown as Record<string, (() => (s: unknown) => unknown) | undefined>)[name];
  if (!fn) throw new Error(`${name} is not exported from selectors`);
  return fn()(st(e));
};
const cardLabels = (e: Env) => callSel('selectCardLabels', e) as { id: string; label: string }[];
const allOffers = (e: Env) => callSel('selectAllOffers', e) as readonly CardOffer[];

const exportData = (r: PersistedRoot): string => (backup as unknown as { exportData(r: PersistedRoot): string }).exportData(r);
type ParseResult = { ok: true; root: PersistedRoot } | { ok: false; reason: string };
const parseBackup = (t: string): ParseResult => (backup as unknown as { parseBackup(t: string): ParseResult }).parseBackup(t);

const clone = <T>(o: T): T => structuredClone(o);
const TODAY = new Date(T0).toISOString().slice(0, 10);

const offerInput = (over: Partial<OfferInput> = {}): OfferInput =>
  ({
    bank: 'Test Bank',
    cardProducts: ['Gold Debit'],
    restaurant: 'Test Grill',
    city: 'Lahore',
    discount: { type: 'percent', bp: 2000 },
    capPaisa: 250000,
    terms: 'Mon-Thu only',
    ...over,
  }) as OfferInput;

const userOffer = (id: string, addedOn: string, over: Partial<CardOffer> = {}): CardOffer =>
  ({
    id,
    bank: 'Test Bank',
    cardProducts: ['Gold Debit'],
    restaurant: 'Test Grill',
    city: 'Lahore',
    discount: { type: 'percent', bp: 2000 },
    terms: 't',
    source: { kind: 'user', addedOn },
    ...over,
  }) as CardOffer;

const emptyRoot = (extra: Record<string, unknown> = {}): PersistedRoot =>
  ({ schemaVersion: 1, me: null, people: [], groups: [], bills: [], ...extra }) as unknown as PersistedRoot;

// ───────────── root shape ─────────────

describe('§4 optional root fields', () => {
  it('§4 old root without cards/userOffers still validates', () => {
    expect(PersistedRootSchema.safeParse(emptyRoot()).success).toBe(true);
  });

  it('§4 root with cards and userOffers validates', () => {
    const r = emptyRoot({ cards: [{ id: 'c1', label: 'HBL Platinum' }], userOffers: [userOffer('user-1', '2026-11-02')] });
    expect(PersistedRootSchema.safeParse(r).success).toBe(true);
  });

  it('§4 old root without the new fields hydrates with no recovery and no backup written', async () => {
    const probe = await ready(makeEnv());
    st(probe).onboard('x');
    await flush();
    const key = probe.storage.mainKeys()[0]!;
    const storage = new MemoryStorage();
    storage.map.set(key, JSON.stringify(emptyRoot()));
    const e = await ready(makeEnv({ storage }));
    expect(st(e).hydrated).toBe(true);
    expect(st(e).recovery).toBeNull();
    expect(storage.backupKeys()).toEqual([]);
    expect(cardLabels(e)).toEqual([]);
    expect(allOffers(e)).toEqual([...lahoreOffers]);
  });
});

// ───────────── card labels ─────────────

describe('§4 card labels', () => {
  it('§4 addCardLabel returns an id and stores exactly {id,label}', () => {
    const e = makeEnv();
    const id = act(e).addCardLabel('HBL Platinum');
    expect(id).not.toBe('');
    expect(r5(e).cards).toEqual([{ id, label: 'HBL Platinum' }]);
    expect(Object.keys(r5(e).cards![0]!).sort()).toEqual(['id', 'label']);
  });

  it('§4 addCardLabel trims the label', () => {
    const e = makeEnv();
    const id = act(e).addCardLabel('  Bank AL Habib Debit  ');
    expect(r5(e).cards).toEqual([{ id, label: 'Bank AL Habib Debit' }]);
  });

  it.each(['', '   ', '\t\n'])('§4 addCardLabel(%j) is ignored and returns empty string', (label) => {
    const e = makeEnv();
    expect(act(e).addCardLabel(label)).toBe('');
    expect(r5(e).cards ?? []).toEqual([]);
  });

  it('§4 addCardLabel dedupes case-insensitively and returns the existing id', () => {
    const e = makeEnv();
    const id = act(e).addCardLabel('HBL Platinum');
    expect(act(e).addCardLabel('hbl platinum')).toBe(id);
    expect(act(e).addCardLabel('  HBL PLATINUM ')).toBe(id);
    expect(r5(e).cards).toEqual([{ id, label: 'HBL Platinum' }]);
  });

  it('§4 distinct labels are kept separately with distinct ids', () => {
    const e = makeEnv();
    const a = act(e).addCardLabel('A card');
    const b = act(e).addCardLabel('B card');
    expect(a).not.toBe(b);
    expect(r5(e).cards).toHaveLength(2);
  });

  it('§4 removeCardLabel removes only that label', () => {
    const e = makeEnv();
    const a = act(e).addCardLabel('A card');
    const b = act(e).addCardLabel('B card');
    act(e).removeCardLabel(a);
    expect(r5(e).cards).toEqual([{ id: b, label: 'B card' }]);
  });

  it('§4 removeCardLabel with an unknown id is a no-op', () => {
    const e = makeEnv();
    const a = act(e).addCardLabel('A card');
    act(e).removeCardLabel('nope');
    expect(r5(e).cards).toEqual([{ id: a, label: 'A card' }]);
  });

  it('§4 a label can be re-added after removal', () => {
    const e = makeEnv();
    const a = act(e).addCardLabel('A card');
    act(e).removeCardLabel(a);
    const again = act(e).addCardLabel('a CARD');
    expect(again).not.toBe('');
    expect(r5(e).cards).toEqual([{ id: again, label: 'a CARD' }]);
  });

  it('§4 selectCardLabels returns the stored labels (empty initially)', () => {
    const e = makeEnv();
    expect(cardLabels(e)).toEqual([]);
    const id = act(e).addCardLabel('A card');
    expect(cardLabels(e)).toEqual([{ id, label: 'A card' }]);
  });

  it('§4 selectCardLabels keeps the same reference while unchanged', () => {
    const e = makeEnv();
    act(e).addCardLabel('A card');
    expect(cardLabels(e)).toBe(cardLabels(e));
  });

  it('§4 selectCardLabels with no labels keeps a stable reference', () => {
    const e = makeEnv();
    expect(cardLabels(e)).toBe(cardLabels(e));
  });

  it('§4 root stays valid after card actions', () => {
    const e = makeEnv();
    act(e).addCardLabel('A card');
    expect(PersistedRootSchema.safeParse(root(e)).success).toBe(true);
  });
});

// ───────────── user offers ─────────────

describe('§4 user offers', () => {
  it('§4 addUserOffer returns an id starting "user-" and stores the offer with that id', () => {
    const e = makeEnv();
    const id = act(e).addUserOffer(offerInput());
    expect(id.startsWith('user-')).toBe(true);
    const stored = r5(e).userOffers!;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe(id);
    expect(stored[0]!.bank).toBe('Test Bank');
    expect(stored[0]!.restaurant).toBe('Test Grill');
    expect(stored[0]!.discount).toEqual({ type: 'percent', bp: 2000 });
    expect(stored[0]!.capPaisa).toBe(250000);
  });

  it('§4 addUserOffer forces source {kind:user, addedOn: today from the clock}', () => {
    const e = makeEnv();
    act(e).addUserOffer(offerInput());
    expect(r5(e).userOffers![0]!.source).toEqual({ kind: 'user', addedOn: TODAY });
    expect(TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('§4 addedOn follows the injected clock (next day)', () => {
    const e = makeEnv();
    e.advance(24 * 3600 * 1000);
    act(e).addUserOffer(offerInput());
    expect(r5(e).userOffers![0]!.source).toEqual({
      kind: 'user',
      addedOn: new Date(T0 + 24 * 3600 * 1000).toISOString().slice(0, 10),
    });
  });

  it('§4 addUserOffer carries the note into source.note', () => {
    const e = makeEnv();
    act(e).addUserOffer(offerInput({ note: 'Heard from waiter' }));
    expect(r5(e).userOffers![0]!.source).toEqual({ kind: 'user', addedOn: TODAY, note: 'Heard from waiter' });
  });

  it('§4 addUserOffer ignores a provided source in the input', () => {
    const e = makeEnv();
    const bad = {
      ...offerInput(),
      source: { kind: 'published', url: 'https://hbl.com/x', title: 'Fake', retrievedOn: '2020-01-01', confidence: 'high' },
    };
    act(e).addUserOffer(bad as unknown as OfferInput);
    expect(r5(e).userOffers![0]!.source).toEqual({ kind: 'user', addedOn: TODAY });
  });

  it('§4 addUserOffer ignores a provided user source with a different addedOn', () => {
    const e = makeEnv();
    const bad = { ...offerInput(), source: { kind: 'user', addedOn: '1999-01-01', note: 'sneaky' } };
    act(e).addUserOffer(bad as unknown as OfferInput);
    expect(r5(e).userOffers![0]!.source).toEqual({ kind: 'user', addedOn: TODAY });
  });

  it('§4 addUserOffer gives distinct ids to successive offers', () => {
    const e = makeEnv();
    const a = act(e).addUserOffer(offerInput());
    const b = act(e).addUserOffer(offerInput());
    expect(a).not.toBe(b);
    expect(r5(e).userOffers).toHaveLength(2);
  });

  it('§4 the stored root validates after addUserOffer', () => {
    const e = makeEnv();
    act(e).addUserOffer(
      offerInput({ note: 'n', daysOfWeek: [1, 2], validTo: '2027-01-01', minSpendPaisa: 100000 } as unknown as Partial<OfferInput>),
    );
    expect(PersistedRootSchema.safeParse(root(e)).success).toBe(true);
  });

  it('§4 removeUserOffer removes only that offer', () => {
    const e = makeEnv();
    const a = act(e).addUserOffer(offerInput({ restaurant: 'A' }));
    const b = act(e).addUserOffer(offerInput({ restaurant: 'B' }));
    act(e).removeUserOffer(a);
    expect(r5(e).userOffers!.map((o) => o.id)).toEqual([b]);
  });

  it('§4 removeUserOffer with an unknown id is a no-op', () => {
    const e = makeEnv();
    const a = act(e).addUserOffer(offerInput());
    act(e).removeUserOffer('user-nope');
    expect(r5(e).userOffers!.map((o) => o.id)).toEqual([a]);
  });
});

// ───────────── selectAllOffers ─────────────

describe('§4 selectAllOffers', () => {
  it('§4 with no user offers returns exactly the bundled Lahore offers', () => {
    const e = makeEnv();
    expect(allOffers(e)).toEqual([...lahoreOffers]);
    expect(allOffers(e).length).toBeGreaterThan(0);
  });

  it('§4 includes bundled plus user offers', () => {
    const e = makeEnv();
    const id = act(e).addUserOffer(offerInput());
    const all = allOffers(e);
    expect(all).toHaveLength(lahoreOffers.length + 1);
    expect(all.some((o) => o.id === id)).toBe(true);
    for (const o of lahoreOffers) expect(all.some((x) => x.id === o.id)).toBe(true);
  });

  it('§4 returns the same reference while nothing changed', () => {
    const e = makeEnv();
    expect(allOffers(e)).toBe(allOffers(e));
    act(e).addUserOffer(offerInput());
    expect(allOffers(e)).toBe(allOffers(e));
  });

  it('§4 same reference when unrelated state changes (card label added)', () => {
    const e = makeEnv();
    act(e).addUserOffer(offerInput());
    const before = allOffers(e);
    act(e).addCardLabel('A card');
    expect(allOffers(e)).toBe(before);
  });

  it('§4 returns a new reference after addUserOffer', () => {
    const e = makeEnv();
    const before = allOffers(e);
    act(e).addUserOffer(offerInput());
    expect(allOffers(e)).not.toBe(before);
  });

  it('§4 returns a new reference after removeUserOffer and drops the offer', () => {
    const e = makeEnv();
    const id = act(e).addUserOffer(offerInput());
    const before = allOffers(e);
    act(e).removeUserOffer(id);
    expect(allOffers(e)).not.toBe(before);
    expect(allOffers(e).some((o) => o.id === id)).toBe(false);
  });
});

// ───────────── persistence ─────────────

describe('§4 persistence', () => {
  it.each([false, true])('§4 cards and userOffers round-trip through storage (async=%s)', async (isAsync) => {
    const a = await ready(makeEnv({ async: isAsync }));
    const cardId = act(a).addCardLabel('HBL Platinum');
    const offerId = act(a).addUserOffer(offerInput({ note: 'hi' }));
    await flush();
    const b = await ready(makeEnv({ storage: a.storage, idPrefix: 'second' }));
    expect(st(b).hydrated).toBe(true);
    expect(st(b).recovery).toBeNull();
    expect(r5(b).cards).toEqual([{ id: cardId, label: 'HBL Platinum' }]);
    expect(r5(b).userOffers).toEqual(r5(a).userOffers);
    expect(r5(b).userOffers![0]!.id).toBe(offerId);
    expect(allOffers(b)).toHaveLength(lahoreOffers.length + 1);
  });

  it('§4 removals are persisted', async () => {
    const a = await ready(makeEnv());
    const c = act(a).addCardLabel('A card');
    const o = act(a).addUserOffer(offerInput());
    await flush();
    act(a).removeCardLabel(c);
    act(a).removeUserOffer(o);
    await flush();
    const b = await ready(makeEnv({ storage: a.storage, idPrefix: 'second' }));
    expect(cardLabels(b)).toEqual([]);
    expect(allOffers(b)).toHaveLength(lahoreOffers.length);
  });

  it('§4 persisted card objects contain only id and label', async () => {
    const a = await ready(makeEnv());
    act(a).addCardLabel('A card');
    await flush();
    const key = a.storage.mainKeys()[0]!;
    const saved = JSON.parse(a.storage.map.get(key)!) as { cards: Record<string, unknown>[] };
    expect(Object.keys(saved.cards[0]!).sort()).toEqual(['id', 'label']);
  });
});

// ───────────── backup ─────────────

describe('§4 backup', () => {
  it('§4 exportData includes cards and userOffers; parseBackup returns them', () => {
    const e = makeEnv();
    const c = act(e).addCardLabel('HBL Platinum');
    const o = act(e).addUserOffer(offerInput());
    const text = exportData(root(e));
    expect(text).toContain('HBL Platinum');
    expect(text).toContain(o);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const pr = parsed.root as unknown as P5Root;
    expect(pr.cards).toEqual([{ id: c, label: 'HBL Platinum' }]);
    expect(pr.userOffers).toEqual(r5(e).userOffers);
  });

  it('§4 parseBackup accepts an old backup without the new fields', () => {
    const e = makeEnv();
    const parsed = parseBackup(exportData(root(e)));
    expect(parsed.ok).toBe(true);
  });

  it('§4 merge: cards merged by case-insensitive label, no duplicates, local id kept', () => {
    const local = makeEnv();
    const lid = act(local).addCardLabel('HBL Platinum');
    const imported = emptyRoot({
      cards: [
        { id: 'imp-1', label: 'hbl platinum' },
        { id: 'imp-2', label: 'Meezan Gold' },
      ],
    });
    act(local).restoreBackup(imported, 'merge');
    const cards = r5(local).cards!;
    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.label.toLowerCase() === 'hbl platinum')).toHaveLength(1);
    expect(cards.find((c) => c.label.toLowerCase() === 'hbl platinum')!.id).toBe(lid);
    expect(cards.some((c) => c.label === 'Meezan Gold')).toBe(true);
    for (const c of cards) expect(Object.keys(c).sort()).toEqual(['id', 'label']);
  });

  it('§4 merge: cards imported into a local root with none', () => {
    const local = makeEnv();
    act(local).restoreBackup(emptyRoot({ cards: [{ id: 'imp-1', label: 'Meezan Gold' }] }), 'merge');
    expect(r5(local).cards).toEqual([{ id: 'imp-1', label: 'Meezan Gold' }]);
  });

  it('§4 merge: local cards survive when the imported root has none', () => {
    const local = makeEnv();
    const lid = act(local).addCardLabel('HBL Platinum');
    act(local).restoreBackup(emptyRoot(), 'merge');
    expect(r5(local).cards).toEqual([{ id: lid, label: 'HBL Platinum' }]);
  });

  it('§4 merge: userOffers unioned by id', () => {
    const local = makeEnv();
    const lid = act(local).addUserOffer(offerInput({ restaurant: 'Local' }));
    const imported = emptyRoot({ userOffers: [userOffer('user-imp', '2026-11-01', { restaurant: 'Imported' })] });
    act(local).restoreBackup(imported, 'merge');
    const ids = r5(local).userOffers!.map((o) => o.id).sort();
    expect(ids).toEqual([lid, 'user-imp'].sort());
  });

  it('§4 merge: same id, later addedOn wins (imported newer)', () => {
    const local = makeEnv();
    const lid = act(local).addUserOffer(offerInput({ restaurant: 'Local' }));
    const imported = emptyRoot({ userOffers: [userOffer(lid, '2026-11-05', { restaurant: 'Imported' })] });
    act(local).restoreBackup(imported, 'merge');
    const offers = r5(local).userOffers!;
    expect(offers).toHaveLength(1);
    expect(offers[0]!.restaurant).toBe('Imported');
    expect(offers[0]!.source).toEqual({ kind: 'user', addedOn: '2026-11-05' });
  });

  it('§4 merge: same id, later addedOn wins (local newer)', () => {
    const local = makeEnv();
    const lid = act(local).addUserOffer(offerInput({ restaurant: 'Local' }));
    const imported = emptyRoot({ userOffers: [userOffer(lid, '2026-10-01', { restaurant: 'Imported' })] });
    act(local).restoreBackup(imported, 'merge');
    const offers = r5(local).userOffers!;
    expect(offers).toHaveLength(1);
    expect(offers[0]!.restaurant).toBe('Local');
  });

  it('§4 merge: same id and same addedOn is a tie, local wins', () => {
    const local = makeEnv();
    const lid = act(local).addUserOffer(offerInput({ restaurant: 'Local' }));
    const imported = emptyRoot({ userOffers: [userOffer(lid, TODAY, { restaurant: 'Imported' })] });
    act(local).restoreBackup(imported, 'merge');
    const offers = r5(local).userOffers!;
    expect(offers).toHaveLength(1);
    expect(offers[0]!.restaurant).toBe('Local');
  });

  it('§4 merge: result root validates and selectAllOffers reflects it', () => {
    const local = makeEnv();
    act(local).addUserOffer(offerInput());
    act(local).restoreBackup(emptyRoot({ userOffers: [userOffer('user-imp', '2026-11-01')] }), 'merge');
    expect(PersistedRootSchema.safeParse(root(local)).success).toBe(true);
    expect(allOffers(local)).toHaveLength(lahoreOffers.length + 2);
  });

  it('§4 replace: cards and userOffers are swapped for the imported ones', () => {
    const local = makeEnv();
    act(local).addCardLabel('Local card');
    act(local).addUserOffer(offerInput({ restaurant: 'Local' }));
    const imported = emptyRoot({
      cards: [{ id: 'imp-1', label: 'Imported card' }],
      userOffers: [userOffer('user-imp', '2026-11-01', { restaurant: 'Imported' })],
    });
    act(local).restoreBackup(clone(imported), 'replace');
    expect(r5(local).cards).toEqual([{ id: 'imp-1', label: 'Imported card' }]);
    expect(r5(local).userOffers!.map((o) => o.id)).toEqual(['user-imp']);
  });

  it('§4 replace with an imported root lacking the fields clears local cards and userOffers', () => {
    const local = makeEnv();
    act(local).addCardLabel('Local card');
    act(local).addUserOffer(offerInput());
    act(local).restoreBackup(emptyRoot(), 'replace');
    expect(r5(local).cards ?? []).toEqual([]);
    expect(r5(local).userOffers ?? []).toEqual([]);
    expect(allOffers(local)).toHaveLength(lahoreOffers.length);
  });

  it('§4 restored cards/userOffers are persisted', async () => {
    const local = await ready(makeEnv());
    act(local).restoreBackup(
      emptyRoot({ cards: [{ id: 'imp-1', label: 'Imported card' }], userOffers: [userOffer('user-imp', '2026-11-01')] }),
      'replace',
    );
    await flush();
    const key = local.storage.mainKeys()[0]!;
    const saved = JSON.parse(local.storage.map.get(key)!) as P5Root;
    expect(saved.cards).toEqual([{ id: 'imp-1', label: 'Imported card' }]);
    expect(saved.userOffers!.map((o) => o.id)).toEqual(['user-imp']);
  });
});
