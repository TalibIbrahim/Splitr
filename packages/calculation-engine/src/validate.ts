import { makeIssue, type IssueExtra } from './issues';
import { paisaOf } from './rational';
import type { Adjustment, BillInput, Issue, Item, Participant } from './types';

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

type Path = readonly (string | number)[];

function bad(issues: Issue[], rule: string, message: string, path: Path, extra: IssueExtra = {}): void {
  issues.push(makeIssue('INVALID_INPUT', 'error', rule, message, { path, ...extra }));
}

/** R2.4: participants. Returns the set of valid participant ids. */
export function validateParticipants(participants: readonly Participant[], issues: Issue[]): Set<string> {
  const ids = new Set<string>();
  participants.forEach((p, i) => {
    if (!isId(p?.id)) {
      bad(issues, 'R2.4', 'participant id must be a non-empty string', ['participants', i, 'id']);
      return;
    }
    if (ids.has(p.id)) {
      bad(issues, 'R2.4', `duplicate participant id "${p.id}"`, ['participants', i, 'id'], { participantId: p.id });
      return;
    }
    ids.add(p.id);
  });
  return ids;
}

function validateAssignment(item: Item, i: number, pids: ReadonlySet<string>, issues: Issue[]): void {
  const path: Path = ['items', i, 'assignment'];
  const a = item.assignment;
  const extra: IssueExtra = isId(item.id) ? { itemId: item.id } : {};
  const ref = (pid: unknown, sub: Path): void => {
    if (!isId(pid) || !pids.has(pid)) {
      bad(issues, 'R3.4', `unknown participant "${String(pid)}"`, [...path, ...sub], extra);
    }
  };
  const dups = (list: readonly unknown[]): void => {
    const seen = new Set<unknown>();
    for (const x of list) {
      if (seen.has(x)) {
        bad(issues, 'R3.4', `participant "${String(x)}" appears more than once in an assignment`, path, extra);
        return;
      }
      seen.add(x);
    }
  };
  switch (a?.kind) {
    case 'unassigned':
      return;
    case 'equal':
      if (!Array.isArray(a.participantIds) || a.participantIds.length === 0) {
        bad(issues, 'R4.2', 'equal assignment needs a non-empty participantIds list', path, extra);
        return;
      }
      a.participantIds.forEach((pid, k) => ref(pid, ['participantIds', k]));
      dups(a.participantIds);
      return;
    case 'weights':
    case 'percent':
    case 'amounts':
    case 'units': {
      if (!Array.isArray(a.entries)) {
        bad(issues, 'R3.4', 'assignment entries must be an array', path, extra);
        return;
      }
      if (a.kind === 'weights' && a.entries.length === 0) {
        bad(issues, 'R4.3', 'weights assignment needs at least one entry', path, extra);
      }
      // Entries are structurally untrusted here, so read them as loose records.
      const entries = a.entries as readonly Record<string, unknown>[];
      entries.forEach((e, k) => {
        ref(e?.participantId, ['entries', k, 'participantId']);
        const epath: Path = [...path, 'entries', k];
        if (a.kind === 'weights') {
          if (!isInt(e?.weight) || e.weight < 1) bad(issues, 'R3.4', 'weight must be a positive integer', [...epath, 'weight'], extra);
        } else if (a.kind === 'percent') {
          if (!isInt(e?.bp) || e.bp < 1) bad(issues, 'R3.4', 'bp must be a positive integer', [...epath, 'bp'], extra);
        } else if (a.kind === 'units') {
          if (!isInt(e?.units) || e.units < 1) bad(issues, 'R3.4', 'units must be a positive integer', [...epath, 'units'], extra);
        } else {
          const amt = e?.amount;
          if (!isInt(amt)) {
            bad(issues, 'R1.1', 'amount must be an integer number of paisa', [...epath, 'amount'], extra);
          } else if (isInt(item.lineTotal) && ((item.lineTotal >= 0 && amt < 0) || (item.lineTotal <= 0 && amt > 0))) {
            bad(issues, 'R4.5', 'amount must have the same sign as lineTotal (or be 0)', [...epath, 'amount'], extra);
          }
        }
      });
      dups(entries.map((e) => e?.participantId));
      return;
    }
    default:
      bad(issues, 'R4', 'unknown assignment kind', path, extra);
  }
}

/** R2.4, R3.2, R3.3, R3.4 for items. Returns indexes of items with INVALID_INPUT problems. */
export function validateItems(items: readonly Item[], pids: ReadonlySet<string>, issues: Issue[]): Set<number> {
  const invalid = new Set<number>();
  const ids = new Set<string>();
  items.forEach((item, i) => {
    const before = issues.length;
    if (!isId(item?.id)) {
      bad(issues, 'R2.4', 'item id must be a non-empty string', ['items', i, 'id']);
    } else if (ids.has(item.id)) {
      bad(issues, 'R2.4', `duplicate item id "${item.id}"`, ['items', i, 'id'], { itemId: item.id });
    } else {
      ids.add(item.id);
    }
    const extra: IssueExtra = isId(item?.id) ? { itemId: item.id } : {};
    if (!isInt(item?.quantity) || item.quantity < 1) {
      bad(issues, 'R3.2', 'quantity must be an integer >= 1', ['items', i, 'quantity'], extra);
    }
    if (!isInt(item?.lineTotal)) {
      bad(issues, 'R1.1', 'lineTotal must be an integer number of paisa', ['items', i, 'lineTotal'], extra);
    }
    if (item?.unitPrice !== undefined) {
      if (!isInt(item.unitPrice)) {
        bad(issues, 'R1.1', 'unitPrice must be an integer number of paisa', ['items', i, 'unitPrice'], extra);
      } else if (isInt(item.quantity) && item.quantity >= 1 && isInt(item.lineTotal)) {
        const expected = BigInt(item.quantity) * BigInt(item.unitPrice);
        const diff = BigInt(item.lineTotal) - expected;
        if (diff !== 0n) {
          issues.push(
            makeIssue('LINE_ARITHMETIC_MISMATCH', 'error', 'R3.3', `quantity x unitPrice = ${expected} but lineTotal = ${item.lineTotal}`, {
              path: ['items', i, 'lineTotal'],
              ...extra,
              ...(Number.isSafeInteger(Number(diff)) ? { difference: paisaOf(diff) } : {}),
            }),
          );
        }
      }
    }
    if (!Array.isArray(item?.categories) || item.categories.some((c) => typeof c !== 'string')) {
      bad(issues, 'R6.1', 'categories must be an array of strings', ['items', i, 'categories'], extra);
    }
    if (item?.assignment === undefined) {
      bad(issues, 'R4', 'assignment is required', ['items', i, 'assignment'], extra);
    } else {
      validateAssignment(item, i, pids, issues);
    }
    if (issues.slice(before).some((x) => x.code === 'INVALID_INPUT')) invalid.add(i);
  });
  return invalid;
}

function validateAdjustment(
  a: Adjustment,
  i: number,
  ids: Set<string>,
  adjIds: ReadonlySet<string>,
  pids: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
  issues: Issue[],
): void {
  if (!isId(a?.id)) bad(issues, 'R2.4', 'adjustment id must be a non-empty string', ['adjustments', i, 'id']);
  else if (ids.has(a.id)) bad(issues, 'R2.4', `duplicate adjustment id "${a.id}"`, ['adjustments', i, 'id'], { adjustmentId: a.id });
  else ids.add(a.id);
  const extra: IssueExtra = isId(a?.id) ? { adjustmentId: a.id } : {};
  const p = (...rest: (string | number)[]): Path => ['adjustments', i, ...rest];

  const kinds: readonly string[] = ['discount', 'tax', 'serviceCharge', 'tip', 'fee', 'custom'];
  if (!kinds.includes(a?.kind)) bad(issues, 'R5.1', 'unknown adjustment kind', p('kind'), extra);
  if (a?.kind === 'custom' && a.direction !== 'add' && a.direction !== 'subtract') {
    bad(issues, 'R5.1', "custom adjustments need direction 'add' or 'subtract'", p('direction'), extra);
  }
  const subtracting = a?.kind === 'discount' || (a?.kind === 'custom' && a.direction === 'subtract');
  if (typeof a?.order !== 'number' || !Number.isFinite(a.order)) {
    bad(issues, 'R5.3', 'order must be a finite number', p('order'), extra);
  }

  const v = a?.value;
  if (v?.type === 'rate') {
    if (!isInt(v.bp)) bad(issues, 'R1.1', 'rate bp must be an integer', p('value', 'bp'), extra);
    else if (v.bp < 0) bad(issues, 'R1.2', 'rate bp must be non-negative', p('value', 'bp'), extra);
    else if (subtracting && v.bp > 10_000) bad(issues, 'R1.2', 'discount rate must be 0-10000 bp', p('value', 'bp'), extra);
  } else if (v?.type === 'fixed') {
    if (!isInt(v.amount)) bad(issues, 'R1.1', 'fixed amount must be an integer number of paisa', p('value', 'amount'), extra);
    else if (v.amount < 0) bad(issues, 'R5.2', 'fixed amount must be a non-negative magnitude', p('value', 'amount'), extra);
  } else {
    bad(issues, 'R5.2', 'value must be a rate or a fixed amount', p('value'), extra);
  }

  const b = a?.base;
  if (b !== undefined) {
    if (b.type === 'fixed') {
      if (!isInt(b.amount)) bad(issues, 'R7.3', 'fixed base amount must be an integer', p('base', 'amount'), extra);
    } else if (b.type === 'items-after') {
      if (b.include !== 'all-prior') {
        if (!Array.isArray(b.include)) {
          bad(issues, 'R7.2', "include must be an id list or 'all-prior'", p('base', 'include'), extra);
        } else {
          b.include.forEach((id, k) => {
            if (!adjIds.has(id)) bad(issues, 'R3.4', `unknown adjustment "${String(id)}"`, p('base', 'include', k), extra);
          });
        }
      }
    } else if (b.type !== 'items') {
      bad(issues, 'R7', 'unknown base type', p('base'), extra);
    }
  }

  const e = a?.eligibility;
  if (e) {
    for (const key of ['itemIds', 'excludeItemIds'] as const) {
      e[key]?.forEach((id, k) => {
        if (!itemIds.has(id)) bad(issues, 'R3.4', `unknown item "${String(id)}"`, p('eligibility', key, k), extra);
      });
    }
  }

  if (a?.cap !== undefined) {
    if (!isInt(a.cap)) bad(issues, 'R1.1', 'cap must be an integer number of paisa', p('cap'), extra);
    else if (a.cap < 0) bad(issues, 'R8.5', 'cap must be non-negative', p('cap'), extra);
  }
  if (a?.minimumSpend !== undefined && !isInt(a.minimumSpend)) bad(issues, 'R8.2', 'minimumSpend must be an integer', p('minimumSpend'), extra);
  if (a?.printedAmount !== undefined && !isInt(a.printedAmount)) bad(issues, 'R8.8', 'printedAmount must be an integer', p('printedAmount'), extra);
  if (a?.rounding !== undefined && !['half-up', 'half-even', 'down', 'up'].includes(a.rounding)) {
    bad(issues, 'R8.3', 'unknown rounding mode', p('rounding'), extra);
  }
  if (a?.override !== undefined) {
    if (!isInt(a.override.amount)) {
      bad(issues, 'R1.1', 'override amount must be an integer number of paisa', p('override', 'amount'), extra);
    } else if (a.override.amount < 0) {
      bad(issues, 'R8.7', 'override amount must be non-negative', p('override', 'amount'), extra);
    }
    if (typeof a.override.reason !== 'string' || a.override.reason.trim().length === 0) {
      bad(issues, 'R3.6', 'override.reason must be non-empty', p('override', 'reason'), extra);
    }
  }
  const val = a?.validity;
  if (val) {
    if (val.from !== undefined && !isIsoDate(val.from)) bad(issues, 'R8.1', 'validity.from must be YYYY-MM-DD', p('validity', 'from'), extra);
    if (val.to !== undefined && !isIsoDate(val.to)) bad(issues, 'R8.1', 'validity.to must be YYYY-MM-DD', p('validity', 'to'), extra);
    if (val.daysOfWeek !== undefined && (!Array.isArray(val.daysOfWeek) || val.daysOfWeek.some((d) => !isInt(d) || d < 0 || d > 6))) {
      bad(issues, 'R8.1', 'daysOfWeek must contain integers 0-6', p('validity', 'daysOfWeek'), extra);
    }
  }

  const al = a?.allocation;
  if (al) {
    const check = (list: readonly unknown[], at: Path): void => {
      const seen = new Set<unknown>();
      list.forEach((pid, k) => {
        if (!isId(pid) || !pids.has(pid)) bad(issues, 'R3.4', `unknown participant "${String(pid)}"`, [...at, k], extra);
        else if (seen.has(pid)) bad(issues, 'R3.4', `participant "${pid}" appears more than once in allocation`, [...at, k], extra);
        seen.add(pid);
      });
    };
    if (al.type === 'equal') {
      if (al.participantIds !== undefined) {
        if (!Array.isArray(al.participantIds) || al.participantIds.length === 0) {
          bad(issues, 'R9.3', 'equal participantIds must be non-empty when given', p('allocation', 'participantIds'), extra);
        } else {
          check(al.participantIds, p('allocation', 'participantIds'));
        }
      }
    } else if (al.type === 'weights') {
      if (!Array.isArray(al.entries) || al.entries.length === 0) {
        bad(issues, 'R9.3', 'weights allocation needs at least one entry', p('allocation', 'entries'), extra);
      } else {
        check(al.entries.map((x) => x?.participantId), p('allocation', 'entries'));
        al.entries.forEach((x, k) => {
          if (!isInt(x?.weight) || x.weight < 1) {
            bad(issues, 'R3.4', 'weight must be a positive integer', p('allocation', 'entries', k, 'weight'), extra);
          }
        });
      }
    } else if (al.type !== 'proportional') {
      bad(issues, 'R9.3', 'unknown allocation type', p('allocation'), extra);
    }
  }
}

/** Full bill validation (R1-R3). Appends INVALID_INPUT / LINE_ARITHMETIC_MISMATCH errors. */
export function validateBill(
  input: BillInput,
  issues: Issue[],
): { participantIds: Set<string>; invalidItems: Set<number>; structured: boolean } {
  if (input?.currency !== 'PKR') bad(issues, 'R1.1', "currency must be 'PKR'", ['currency']);
  const arrays = ['participants', 'items', 'adjustments', 'contributions'] as const;
  for (const key of arrays) {
    if (!Array.isArray(input?.[key])) bad(issues, 'R1', `${key} must be an array`, [key]);
  }
  if (!arrays.every((k) => Array.isArray(input?.[k]))) {
    return { participantIds: new Set(), invalidItems: new Set(), structured: false };
  }

  const participantIds = validateParticipants(input.participants, issues);
  if (input.participants.length < 1) bad(issues, 'R3.1', 'a bill needs at least one participant', ['participants']);
  const invalidItems = validateItems(input.items, participantIds, issues);

  const itemIds = new Set(input.items.map((x) => x?.id).filter(isId));
  const adjIds = new Set(input.adjustments.map((x) => x?.id).filter(isId));
  const seen = new Set<string>();
  input.adjustments.forEach((a, i) => validateAdjustment(a, i, seen, adjIds, participantIds, itemIds, issues));

  input.contributions.forEach((c, i) => {
    if (!isId(c?.participantId) || !participantIds.has(c.participantId)) {
      bad(issues, 'R3.4', `unknown participant "${String(c?.participantId)}"`, ['contributions', i, 'participantId']);
    }
    if (!isInt(c?.amount)) {
      bad(issues, 'R1.1', 'contribution amount must be an integer number of paisa', ['contributions', i, 'amount']);
    } else if (c.amount <= 0) {
      bad(issues, 'R12.1', 'contribution amount must be positive', ['contributions', i, 'amount']);
    }
  });

  for (const key of ['printedSubtotal', 'printedTotal'] as const) {
    if (input[key] !== undefined && !isInt(input[key])) bad(issues, 'R1.1', `${key} must be an integer`, [key]);
  }
  const u = input.settlementRoundingUnit;
  if (u !== undefined && (!isInt(u) || u < 1)) {
    bad(issues, 'R3.5', 'settlementRoundingUnit must be an integer >= 1', ['settlementRoundingUnit']);
  }

  if (input.date !== undefined) {
    if (!isIsoDate(input.date)) bad(issues, 'R3.7', 'date must be a valid YYYY-MM-DD', ['date']);
  } else {
    input.adjustments.forEach((a, i) => {
      if (a?.validity !== undefined) bad(issues, 'R3.7', 'bill.date is required when an adjustment has validity', ['adjustments', i, 'validity']);
    });
  }

  // R1.1: the items subtotal must itself be a safe integer.
  if (invalidItems.size === 0) {
    const sum = input.items.reduce((s, it) => s + BigInt(it.lineTotal), 0n);
    if (!Number.isSafeInteger(Number(sum)) || BigInt(Number(sum)) !== sum) {
      bad(issues, 'R1.1', 'items subtotal exceeds the safe integer range', ['items']);
    }
  }
  return { participantIds, invalidItems, structured: true };
}
