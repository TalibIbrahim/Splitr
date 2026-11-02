import { rowsToTrace, type LrRow } from './largest-remainder';
import { floorDiv, paisaOf, q } from './rational';
import type { AllocationTrace, Paisa, SettlementResult, TraceStep } from './types';

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface RoundedTotals {
  readonly R: bigint;
  readonly rounded: ReadonlyMap<string, bigint>;
  readonly allocation: AllocationTrace;
}

/** R11: settlement rounding with largest remainder over multiples of `u`. */
export function roundTotals(totals: readonly { id: string; t: bigint }[], T: bigint, u: bigint): RoundedTotals {
  const R = u * floorDiv(2n * T + u, 2n * u); // R11.1
  const base = totals
    .map(({ id, t }) => {
      const f = u * floorDiv(t, u);
      return { id, t, f, r: t - f };
    })
    .sort((a, b) => cmpStr(a.id, b.id));
  const floorSum = base.reduce((s, x) => s + x.f, 0n);
  let k = (R - floorSum) / u;
  if (k < 0n) k = 0n;
  if (k > BigInt(base.length)) k = BigInt(base.length);
  const ranked = [...base].sort((a, b) => (a.r > b.r ? -1 : a.r < b.r ? 1 : cmpStr(a.id, b.id)));
  const winners = new Set<string>();
  for (const x of ranked) {
    if (k <= 0n) break;
    winners.add(x.id);
    k -= 1n;
  }
  const rows: LrRow[] = base.map((x) => {
    const bonus = winners.has(x.id) ? u : 0n;
    return {
      id: x.id,
      weight: q(x.t),
      quota: q(x.t),
      floor: x.f,
      remainder: q(x.r),
      bonus,
      amount: x.f + bonus,
    };
  });
  return { R, rounded: new Map(rows.map((r) => [r.id, r.amount])), allocation: rowsToTrace(R, rows) };
}

/** R12: balances, rounding residual and greedy transfers. Caller guarantees Σ contributions = T. */
export function buildSettlement(
  participantIds: readonly string[],
  rounded: ReadonlyMap<string, bigint>,
  contributions: readonly { participantId: string; amount: number }[],
  T: bigint,
  R: bigint,
): { settlement: SettlementResult; trace: TraceStep[] } {
  const contributed = new Map<string, bigint>();
  for (const c of contributions) {
    contributed.set(c.participantId, (contributed.get(c.participantId) ?? 0n) + BigInt(c.amount));
  }
  // R12.2: residual goes to the largest contributor, ties to the lower id.
  let holder = '';
  let best = -1n;
  for (const [id, amt] of contributed) {
    if (amt > best || (amt === best && id < holder)) {
      best = amt;
      holder = id;
    }
  }
  const residual = R - T;
  const nets = new Map<string, bigint>();
  const balances = participantIds.map((id) => {
    const c = contributed.get(id) ?? 0n;
    const share = rounded.get(id) ?? 0n;
    const net = c - share + (id === holder ? residual : 0n);
    nets.set(id, net);
    return { participantId: id, contributed: paisaOf(c), share: paisaOf(share), net: paisaOf(net) };
  });

  // R12.4: greedy largest debtor <-> largest creditor.
  const transfers: { from: string; to: string; amount: Paisa }[] = [];
  const trace: TraceStep[] = [
    { type: 'rounding-residual', residual: paisaOf(residual), participantId: holder },
  ];
  for (;;) {
    let debtor: string | undefined;
    let creditor: string | undefined;
    for (const [id, n] of nets) {
      if (n < 0n && (debtor === undefined || n < (nets.get(debtor) ?? 0n) || (n === nets.get(debtor) && id < debtor))) debtor = id;
      if (n > 0n && (creditor === undefined || n > (nets.get(creditor) ?? 0n) || (n === nets.get(creditor) && id < creditor))) creditor = id;
    }
    if (debtor === undefined || creditor === undefined) break;
    const owe = -(nets.get(debtor) ?? 0n);
    const due = nets.get(creditor) ?? 0n;
    const amount = owe < due ? owe : due;
    nets.set(debtor, (nets.get(debtor) ?? 0n) + amount);
    nets.set(creditor, (nets.get(creditor) ?? 0n) - amount);
    transfers.push({ from: debtor, to: creditor, amount: paisaOf(amount) });
    trace.push({ type: 'transfer', from: debtor, to: creditor, amount: paisaOf(amount) });
  }

  return {
    settlement: { balances, residual: { amount: paisaOf(residual), participantId: holder }, transfers },
    trace,
  };
}
