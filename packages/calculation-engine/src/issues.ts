import type { Issue, IssueCode, NotAppliedReason, Paisa } from './types';

export interface IssueExtra {
  readonly path?: readonly (string | number)[];
  readonly itemId?: string;
  readonly adjustmentId?: string;
  readonly participantId?: string;
  readonly difference?: Paisa;
  readonly reason?: NotAppliedReason;
}

export function makeIssue(
  code: IssueCode,
  severity: 'error' | 'warning',
  rule: string,
  message: string,
  extra: IssueExtra = {},
): Issue {
  return { code, severity, rule, message, ...extra };
}

export const hasBlocking = (issues: readonly Issue[]): boolean => issues.some((i) => i.severity === 'error');
