import type { ParseRupeesResult } from '@splitr/bill-domain';

type RupeesFailure = Extract<ParseRupeesResult, { ok: false }>['reason'];

/** Plain-words reason for a parseRupees failure. */
export function rupeesErrorText(reason: RupeesFailure): string {
  switch (reason) {
    case 'empty':
      return 'Enter an amount';
    case 'invalid':
      return "That doesn't look like an amount. Use digits like 1,250 or 99.50";
    case 'too-many-decimals':
      return 'Use at most 2 decimals';
    case 'too-large':
      return 'That amount is too large';
  }
}
