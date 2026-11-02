import type { BillInput, IssueCode, NotAppliedReason } from '../../src/index';

export interface ExpectedWarning {
  code: IssueCode;
  reason?: NotAppliedReason;
  adjustmentId?: string;
  itemId?: string;
  participantId?: string;
}

export interface ExpectedError {
  code: IssueCode;
  rule?: string;
  /** Exact signed difference (R16.1). */
  difference?: number;
  itemId?: string;
  adjustmentId?: string;
}

export interface OkExpect {
  ok: true;
  itemsSubtotal?: number;
  /** Exact bill total T. */
  total: number;
  /** R (rounded total). If omitted the runner derives it from R11.1. */
  roundedTotal?: number;
  /** participantId -> exact total (paisa). Must list every participant. */
  exact: Record<string, number>;
  /** participantId -> settlement-rounded total. Optional; unit 1 fixtures get rounded == exact for free (R11.3). */
  rounded?: Record<string, number>;
  /** adjustmentId -> signed amount. */
  adjustments?: Record<string, number>;
  /** adjustmentId -> participantId -> allocation (zeros may be omitted). */
  allocations?: Record<string, Record<string, number>>;
  /** itemId -> participantId -> share (zeros may be omitted). */
  itemShares?: Record<string, Record<string, number>>;
  /** Exact multiset of warnings. NO_CONTRIBUTIONS is added automatically when there are no contributions. */
  warnings?: ExpectedWarning[];
  settlement?: {
    transfers: [from: string, to: string, amount: number][];
    residual?: { amount: number; participantId: string };
    net?: Record<string, number>;
  };
}

export interface ErrExpect {
  ok: false;
  errors: ExpectedError[];
  warnings?: ExpectedWarning[];
}

export interface Fixture {
  name: string;
  /** Rule IDs this fixture exercises. */
  rules: string[];
  input: BillInput;
  expect: OkExpect | ErrExpect;
}
