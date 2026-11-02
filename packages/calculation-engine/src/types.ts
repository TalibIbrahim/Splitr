/**
 * Public contract of @splitr/calculation-engine.
 * Rule IDs (R1…R15) refer to docs/calculation-rules.md.
 * Owned by the lead (Opus). Implementers must not change these types without approval.
 */

// ───────────────────────────── Primitives (R1) ─────────────────────────────

declare const paisaBrand: unique symbol;
declare const bpBrand: unique symbol;

/** Integer minor units of PKR (1 Rs = 100 paisa). Always a JS safe integer. */
export type Paisa = number & { readonly [paisaBrand]: 'Paisa' };

/** Integer basis points: 1% = 100 bp, 100% = 10_000 bp. */
export type BasisPoints = number & { readonly [bpBrand]: 'BasisPoints' };

export type ParticipantId = string;
export type ItemId = string;
export type AdjustmentId = string;

/** ISO calendar date `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * An exact rational value (R13.3). Numerator/denominator are base-10 BigInt strings,
 * reduced, denominator > 0. `rounded` is half-up to the nearest paisa, for DISPLAY ONLY.
 */
export interface Exact {
  readonly numerator: string;
  readonly denominator: string;
  readonly rounded: Paisa;
}

// ───────────────────────────── Input ─────────────────────────────

export interface Participant {
  readonly id: ParticipantId;
  readonly displayName: string;
}

/** How an item's lineTotal is split among participants (R4). */
export type Assignment =
  | { readonly kind: 'unassigned' }
  /** R4.2 — equal among a non-empty set. */
  | { readonly kind: 'equal'; readonly participantIds: readonly ParticipantId[] }
  /** R4.3 — integer weights (covers fractions: 1/3 + 2/3 → weights 1 and 2). */
  | {
      readonly kind: 'weights';
      readonly entries: readonly { readonly participantId: ParticipantId; readonly weight: number }[];
    }
  /** R4.4 — must sum to exactly 10_000 bp. */
  | {
      readonly kind: 'percent';
      readonly entries: readonly { readonly participantId: ParticipantId; readonly bp: BasisPoints }[];
    }
  /** R4.5 — must sum to exactly lineTotal. */
  | {
      readonly kind: 'amounts';
      readonly entries: readonly { readonly participantId: ParticipantId; readonly amount: Paisa }[];
    }
  /** R4.6 — integer units, must sum to exactly quantity. */
  | {
      readonly kind: 'units';
      readonly entries: readonly { readonly participantId: ParticipantId; readonly units: number }[];
    };

/** Where a value came from — keeps raw receipt values, user input and overrides distinguishable. */
export type ValueSource = 'receipt' | 'user' | 'reconciliation';

export interface Item {
  readonly id: ItemId;
  readonly name: string;
  /** Integer ≥ 1 (R3.2). */
  readonly quantity: number;
  /** Optional; if present, quantity × unitPrice must equal lineTotal (R3.3). */
  readonly unitPrice?: Paisa;
  /** Authoritative amount. Negative = void/refund; 0 = complimentary (R3.2). */
  readonly lineTotal: Paisa;
  /** Free-form tags used by eligibility (R6), e.g. 'food', 'beverage', 'non-taxable'. */
  readonly categories: readonly string[];
  readonly assignment: Assignment;
  readonly source: ValueSource;
}

export type AdjustmentKind = 'discount' | 'tax' | 'serviceCharge' | 'tip' | 'fee' | 'custom';

/** R5.2 — magnitudes only; direction comes from kind (R5.1). */
export type AdjustmentValue =
  | { readonly type: 'rate'; readonly bp: BasisPoints }
  | { readonly type: 'fixed'; readonly amount: Paisa };

/** R7 — what the adjustment is computed on. */
export type AdjustmentBase =
  /** R7.1 — eligible items' pre-adjustment subtotal ("original subtotal"). */
  | { readonly type: 'items' }
  /** R7.2 — eligible items plus the exact attribution of earlier proportional adjustments. */
  | { readonly type: 'items-after'; readonly include: readonly AdjustmentId[] | 'all-prior' }
  /** R7.3 — a printed taxable amount; eligible item shares are used as allocation weights. */
  | { readonly type: 'fixed'; readonly amount: Paisa };

/** R6 — omit itemIds and categories to include all items. Exclusion wins. */
export interface Eligibility {
  readonly itemIds?: readonly ItemId[];
  readonly categories?: readonly string[];
  readonly excludeItemIds?: readonly ItemId[];
  readonly excludeCategories?: readonly string[];
}

/** R8.1 — inclusive date range and/or weekdays (0 = Sunday … 6 = Saturday, UTC). */
export interface Validity {
  readonly from?: IsoDate;
  readonly to?: IsoDate;
  readonly daysOfWeek?: readonly number[];
}

/** R9.3 */
export type AllocationPolicy =
  | { readonly type: 'proportional' }
  | { readonly type: 'equal'; readonly participantIds?: readonly ParticipantId[] }
  | {
      readonly type: 'weights';
      readonly entries: readonly { readonly participantId: ParticipantId; readonly weight: number }[];
    };

/** R8.3 — applied to the magnitude. 'half-up' = half away from zero. */
export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

export interface Adjustment {
  readonly id: AdjustmentId;
  /** Shown in the UI and trace, e.g. "HBL card 20%", "GST 5%". */
  readonly label: string;
  readonly kind: AdjustmentKind;
  /** Required iff kind === 'custom' (R5.1). */
  readonly direction?: 'add' | 'subtract';
  readonly value: AdjustmentValue;
  /** Default { type: 'items' }. */
  readonly base?: AdjustmentBase;
  /** Default: all items. */
  readonly eligibility?: Eligibility;
  /** Maximum magnitude (R8.5). */
  readonly cap?: Paisa;
  /** Base must be ≥ this or the adjustment is not applied (R8.2). */
  readonly minimumSpend?: Paisa;
  readonly validity?: Validity;
  /** Application order, ascending; ties by id (R5.3). */
  readonly order: number;
  /** Default { type: 'proportional' }. */
  readonly allocation?: AllocationPolicy;
  /** Default 'half-up'. */
  readonly rounding?: RoundingMode;
  /** Magnitude printed on the receipt; mismatch is an error (R8.8). */
  readonly printedAmount?: Paisa;
  /** Audited manual magnitude (R8.7). */
  readonly override?: { readonly amount: Paisa; readonly reason: string };
  readonly source: ValueSource;
}

/** R12.1 */
export interface Contribution {
  readonly participantId: ParticipantId;
  /** > 0. */
  readonly amount: Paisa;
}

export interface BillInput {
  readonly currency: 'PKR';
  /** Required when any adjustment has `validity` (R3.7). */
  readonly date?: IsoDate;
  readonly participants: readonly Participant[];
  readonly items: readonly Item[];
  readonly adjustments: readonly Adjustment[];
  readonly contributions: readonly Contribution[];
  /** Printed on the receipt; checked, never trusted silently (R10.4). */
  readonly printedSubtotal?: Paisa;
  /** Printed on the receipt; checked, never trusted silently (R10.5). */
  readonly printedTotal?: Paisa;
  /** Default 100 (Rs 1) (R3.5, R11). */
  readonly settlementRoundingUnit?: Paisa;
}

// ───────────────────────────── Issues ─────────────────────────────

export type IssueCode =
  | 'INVALID_INPUT'
  | 'LINE_ARITHMETIC_MISMATCH'
  | 'ITEM_UNASSIGNED'
  | 'ITEM_UNDER_ASSIGNED'
  | 'ITEM_OVER_ASSIGNED'
  | 'ADJUSTMENT_INVALID_BASE'
  | 'ADJUSTMENT_NOT_APPLIED'
  | 'ADJUSTMENT_PRINTED_MISMATCH'
  | 'ALLOCATION_FALLBACK_EQUAL'
  | 'SUBTOTAL_MISMATCH'
  | 'TOTAL_MISMATCH'
  | 'NEGATIVE_TOTAL'
  | 'NEGATIVE_SHARE'
  | 'NO_CONTRIBUTIONS'
  | 'CONTRIBUTIONS_MISMATCH';

export type NotAppliedReason =
  | 'no-eligible-items'
  | 'outside-validity'
  | 'below-minimum-spend'
  | 'non-positive-base';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: 'error' | 'warning';
  /** Rule ID, e.g. 'R4.4'. */
  readonly rule: string;
  /** Developer-facing English; the UI maps `code` to user copy. */
  readonly message: string;
  /** JSON-ish path into the input, e.g. ['items', 2, 'assignment']. */
  readonly path?: readonly (string | number)[];
  readonly itemId?: ItemId;
  readonly adjustmentId?: AdjustmentId;
  readonly participantId?: ParticipantId;
  /** Signed difference (actual − expected) for mismatch codes. */
  readonly difference?: Paisa;
  readonly reason?: NotAppliedReason;
}

// ───────────────────────────── Trace (R13) ─────────────────────────────

/** One largest-remainder run (R9.1), fully reproducible. */
export interface AllocationTrace {
  readonly total: Paisa;
  readonly rows: readonly {
    readonly participantId: ParticipantId;
    readonly weight: Exact;
    readonly quota: Exact;
    readonly floor: Paisa;
    /** Fractional part used for ranking (0 ≤ remainder < 1 paisa, or < unit for settlement). */
    readonly remainder: Exact;
    /** Leftover paisa (or units) received. */
    readonly bonus: Paisa;
    readonly amount: Paisa;
  }[];
}

export type TraceStep =
  | {
      readonly type: 'item-split';
      readonly itemId: ItemId;
      readonly assignmentKind: Assignment['kind'];
      readonly allocation: AllocationTrace;
    }
  | {
      readonly type: 'adjustment';
      readonly adjustmentId: AdjustmentId;
      readonly eligibleItemIds: readonly ItemId[];
      readonly base: Exact;
      readonly baseType: AdjustmentBase['type'];
      readonly rateBp?: BasisPoints;
      /** B × bp / 10_000 before rounding (rate only). */
      readonly raw?: Exact;
      readonly rounding?: RoundingMode;
      /** Magnitude after R8.3/R8.4. */
      readonly computed: Paisa;
      readonly capped: boolean;
      readonly clamped: boolean;
      readonly overridden?: { readonly amount: Paisa; readonly reason: string };
      readonly notApplied?: NotAppliedReason;
      /** Final signed amount. */
      readonly amount: Paisa;
    }
  | {
      readonly type: 'adjustment-allocation';
      readonly adjustmentId: AdjustmentId;
      readonly policy: AllocationPolicy['type'];
      readonly fallbackEqual: boolean;
      readonly allocation: AllocationTrace;
    }
  | {
      readonly type: 'settlement-rounding';
      readonly unit: Paisa;
      readonly exactTotal: Paisa;
      readonly roundedTotal: Paisa;
      readonly allocation: AllocationTrace;
    }
  | {
      readonly type: 'rounding-residual';
      readonly residual: Paisa;
      readonly participantId: ParticipantId;
    }
  | {
      readonly type: 'transfer';
      readonly from: ParticipantId;
      readonly to: ParticipantId;
      readonly amount: Paisa;
    };

// ───────────────────────────── Output ─────────────────────────────

export interface AdjustmentResult {
  readonly adjustmentId: AdjustmentId;
  readonly label: string;
  readonly kind: AdjustmentKind;
  /** Signed: negative for subtracting adjustments (R5.1). */
  readonly amount: Paisa;
  readonly applied: boolean;
  readonly notAppliedReason?: NotAppliedReason;
  readonly allocations: readonly { readonly participantId: ParticipantId; readonly amount: Paisa }[];
}

export interface ParticipantBreakdown {
  readonly participantId: ParticipantId;
  readonly items: readonly { readonly itemId: ItemId; readonly amount: Paisa }[];
  readonly itemsSubtotal: Paisa;
  readonly adjustments: readonly { readonly adjustmentId: AdjustmentId; readonly amount: Paisa }[];
  /** R10.3 */
  readonly exactTotal: Paisa;
  /** R11 */
  readonly roundedTotal: Paisa;
  /** roundedTotal − exactTotal (R11.3). */
  readonly roundingDelta: Paisa;
}

export interface SettlementResult {
  readonly balances: readonly {
    readonly participantId: ParticipantId;
    readonly contributed: Paisa;
    readonly share: Paisa; // rounded share
    /** contributed − share (+ residual for the residual holder). Positive = is owed money. */
    readonly net: Paisa;
  }[];
  /** R12.2 */
  readonly residual: { readonly amount: Paisa; readonly participantId: ParticipantId };
  /** R12.4 */
  readonly transfers: readonly { readonly from: ParticipantId; readonly to: ParticipantId; readonly amount: Paisa }[];
}

export interface BillBreakdown {
  readonly itemsSubtotal: Paisa;
  /** In application order (R5.3). */
  readonly adjustments: readonly AdjustmentResult[];
  /** Exact bill total T (R10.2). */
  readonly total: Paisa;
  readonly settlementRoundingUnit: Paisa;
  /** R (R11.1). */
  readonly roundedTotal: Paisa;
  /** In input order. */
  readonly participants: readonly ParticipantBreakdown[];
  /** null when there are no contributions (R12.1). */
  readonly settlement: SettlementResult | null;
  readonly trace: readonly TraceStep[];
}

/** R15.1 */
export type CalculationResult =
  | { readonly ok: true; readonly breakdown: BillBreakdown; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly errors: readonly Issue[]; readonly warnings: readonly Issue[] };

/** R14 — Assign-screen preview. */
export type ItemAssignmentStatus = 'assigned' | 'unassigned' | 'under' | 'over' | 'zero';

export interface ItemSharesPreview {
  readonly items: readonly {
    readonly itemId: ItemId;
    readonly status: ItemAssignmentStatus;
    readonly shares: readonly { readonly participantId: ParticipantId; readonly amount: Paisa }[];
    /** lineTotal − Σ shares. */
    readonly unallocated: Paisa;
  }[];
  readonly participants: readonly { readonly participantId: ParticipantId; readonly itemsSubtotal: Paisa }[];
  readonly unallocatedTotal: Paisa;
  /** Items whose status is 'unassigned' | 'under' | 'over' — drives the "N left" badge. */
  readonly needsAttentionCount: number;
  /** INVALID_INPUT only (R14.2). */
  readonly errors: readonly Issue[];
}

// ───────────────────────────── Functions ─────────────────────────────

/** Full calculation (R1–R13, R15). Pure and deterministic. */
export type CalculateBill = (input: BillInput) => CalculationResult;

/** Running item subtotals for the Assign screen (R14). */
export type PreviewItemShares = (
  input: Pick<BillInput, 'participants' | 'items'>,
) => ItemSharesPreview;

/**
 * Largest remainder (R9.1), exposed for direct testing and reuse.
 * Weights are non-negative safe integers or bigint; Σweights > 0. Returns amounts keyed by id, summing to `total`.
 */
export type AllocateLargestRemainder = (
  total: Paisa,
  weights: readonly { readonly id: string; readonly weight: number | bigint }[],
) => ReadonlyMap<string, Paisa>;

/** Validating constructors: throw RangeError on non-safe-integer input. */
export type ToPaisa = (value: number) => Paisa;
export type ToBasisPoints = (value: number) => BasisPoints;
