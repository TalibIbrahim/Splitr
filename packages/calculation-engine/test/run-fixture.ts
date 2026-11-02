import { expect } from 'vitest';
import { calculateBill } from '../src/index';
import type { Issue } from '../src/index';
import type { ExpectedError, ExpectedWarning, Fixture } from './fixtures/types';
import { adjAmounts, allocationsOf, exactTotals, itemShares, nz, nzNested, roundedBillTotal, roundedTotals, sum } from './helpers';

const wkey = (w: { code: string; reason?: string | undefined }) => `${w.code}${w.reason ? `:${w.reason}` : ''}`;

function checkWarnings(actual: readonly Issue[], expected: ExpectedWarning[]): void {
  expect(actual.map(wkey).sort()).toEqual(expected.map(wkey).sort());
  for (const w of expected) {
    const match = actual.find(
      (a) =>
        a.code === w.code &&
        (w.reason === undefined || a.reason === w.reason) &&
        (w.adjustmentId === undefined || a.adjustmentId === w.adjustmentId) &&
        (w.itemId === undefined || a.itemId === w.itemId) &&
        (w.participantId === undefined || a.participantId === w.participantId),
    );
    expect(match, `warning ${JSON.stringify(w)} not found in ${JSON.stringify(actual)}`).toBeDefined();
  }
}

function checkErrors(actual: readonly Issue[], expected: ExpectedError[]): void {
  expect(actual.map((a) => a.code).sort()).toEqual(expected.map((e) => e.code).sort());
  for (const e of expected) {
    const match = actual.find(
      (a) =>
        a.code === e.code &&
        a.severity === 'error' &&
        (e.rule === undefined || a.rule === e.rule) &&
        (e.itemId === undefined || a.itemId === e.itemId) &&
        (e.adjustmentId === undefined || a.adjustmentId === e.adjustmentId) &&
        (e.difference === undefined || a.difference === e.difference),
    );
    expect(match, `error ${JSON.stringify(e)} not found in ${JSON.stringify(actual)}`).toBeDefined();
  }
}

/** Runs a fixture and asserts every expectation plus the generic invariants (R10.2, R10.3, R11.1-R11.3, R12.3). */
export function checkFixture(f: Fixture): void {
  const result = calculateBill(f.input);
  const e = f.expect;

  if (!e.ok) {
    expect(result.ok, 'expected the calculation to fail').toBe(false);
    if (result.ok) return;
    checkErrors(result.errors, e.errors);
    for (const err of result.errors) expect(err.severity).toBe('error');
    if (e.warnings) checkWarnings(result.warnings, e.warnings);
    return;
  }

  if (!result.ok) {
    throw new Error(`expected ok, got errors ${JSON.stringify(result.errors.map((x) => [x.code, x.rule, x.message]))}`);
  }
  const b = result.breakdown;
  const unit = (f.input.settlementRoundingUnit as number | undefined) ?? 100;

  // totals
  expect(b.total as number).toBe(e.total);
  if (e.itemsSubtotal !== undefined) expect(b.itemsSubtotal as number).toBe(e.itemsSubtotal);
  expect(b.itemsSubtotal as number).toBe(sum(f.input.items.map((i) => i.lineTotal as number))); // R10.1
  expect(b.total as number).toBe((b.itemsSubtotal as number) + sum(b.adjustments.map((a) => a.amount as number))); // R10.2
  expect(b.settlementRoundingUnit as number).toBe(unit);

  // participants in input order (R2.3), exact totals
  expect(b.participants.map((p) => p.participantId)).toEqual(f.input.participants.map((p) => p.id));
  expect(exactTotals(b)).toEqual(e.exact);
  expect(sum(b.participants.map((p) => p.exactTotal as number))).toBe(e.total); // R10.3
  for (const p of b.participants) {
    expect(p.itemsSubtotal as number).toBe(sum(p.items.map((i) => i.amount as number)));
    expect((p.exactTotal as number)).toBe((p.itemsSubtotal as number) + sum(p.adjustments.map((a) => a.amount as number)));
    expect(p.roundingDelta as number).toBe((p.roundedTotal as number) - (p.exactTotal as number)); // R11.3
    expect(Math.abs(p.roundingDelta as number)).toBeLessThan(unit);
  }

  // settlement rounding (R11)
  const R = e.roundedTotal ?? roundedBillTotal(e.total, unit);
  expect(b.roundedTotal as number).toBe(R);
  expect(sum(b.participants.map((p) => p.roundedTotal as number))).toBe(R);
  for (const p of b.participants) expect(Math.abs((p.roundedTotal as number) % unit)).toBe(0);
  if (e.rounded) expect(roundedTotals(b)).toEqual(e.rounded);
  if (unit === 1) expect(roundedTotals(b)).toEqual(exactTotals(b)); // R11.3

  // adjustments
  if (e.adjustments) {
    expect(adjAmounts(b)).toEqual(e.adjustments);
  }
  if (e.allocations) {
    for (const [id, expectedAlloc] of Object.entries(e.allocations)) {
      expect(nz(allocationsOf(b, id)), `allocations of ${id}`).toEqual(nz(expectedAlloc));
    }
  }
  for (const a of b.adjustments) {
    expect(sum(a.allocations.map((x) => x.amount as number)), `allocations of ${a.adjustmentId} sum`).toBe(a.amount as number);
  }
  if (e.itemShares) {
    const got = itemShares(b);
    expect(nzNested(Object.fromEntries(Object.keys(e.itemShares).map((k) => [k, got[k] ?? {}])))).toEqual(nzNested(e.itemShares));
  }
  // every item's shares add up to its lineTotal (R4)
  const shares = itemShares(b);
  for (const it of f.input.items) {
    expect(sum(Object.values(shares[it.id] ?? {})), `shares of ${it.id}`).toBe(it.assignment.kind === 'unassigned' ? 0 : (it.lineTotal as number));
  }

  // warnings
  const expectedWarnings: ExpectedWarning[] = [...(e.warnings ?? [])];
  if (f.input.contributions.length === 0 && !expectedWarnings.some((w) => w.code === 'NO_CONTRIBUTIONS')) {
    expectedWarnings.push({ code: 'NO_CONTRIBUTIONS' });
  }
  checkWarnings(result.warnings, expectedWarnings);

  // settlement (R12)
  if (f.input.contributions.length === 0) {
    expect(b.settlement).toBeNull();
  } else {
    const s = b.settlement;
    expect(s).not.toBeNull();
    if (!s) return;
    expect(sum(s.balances.map((x) => x.net as number))).toBe(0); // R12.3
    expect(s.residual.amount as number).toBe(R - e.total); // R12.2
    for (const t of s.transfers) expect(t.amount as number).toBeGreaterThan(0);
    expect(s.transfers.length).toBeLessThanOrEqual(Math.max(0, f.input.participants.length - 1));
    if (e.settlement) {
      expect(s.transfers.map((t) => [t.from, t.to, t.amount as number])).toEqual(e.settlement.transfers);
      if (e.settlement.residual) {
        expect({ amount: s.residual.amount as number, participantId: s.residual.participantId }).toEqual(e.settlement.residual);
      }
      if (e.settlement.net) {
        expect(Object.fromEntries(s.balances.map((x) => [x.participantId, x.net as number]))).toEqual(e.settlement.net);
      }
    }
  }
}
