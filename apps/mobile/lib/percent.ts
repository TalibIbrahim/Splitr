/**
 * Percent text -> basis points using string and integer operations only (no float parsing).
 * "20" -> 2000, "16.5" -> 1650, "2.25" -> 225. More than 2 decimals is rejected.
 */
export type ParsePercentResult =
  | { ok: true; bp: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-many-decimals' | 'too-large' };

const MAX_WHOLE_DIGITS = 7;

/** `maxBp` defaults to 100% (10 000 bp). */
export function parsePercentToBp(text: string, maxBp = 10_000): ParsePercentResult {
  let s = text.trim();
  if (s.endsWith('%')) s = s.slice(0, -1).trim();
  if (s === '') return { ok: false, reason: 'empty' };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return { ok: false, reason: 'invalid' };
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (frac.length > 2) return { ok: false, reason: 'too-many-decimals' };
  if (whole.replace(/^0+(?=\d)/, '').length > MAX_WHOLE_DIGITS) return { ok: false, reason: 'too-large' };
  const bp = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
  if (bp > maxBp) return { ok: false, reason: 'too-large' };
  return { ok: true, bp };
}

/** 2000 -> "20", 1650 -> "16.5", 225 -> "2.25". Integer ops only. */
export function formatBp(bp: number): string {
  const rem = bp % 100;
  const whole = (bp - rem) / 100;
  if (rem === 0) return String(whole);
  const frac = (rem < 10 ? '0' : '') + String(rem);
  return `${whole}.${frac.replace(/0$/, '')}`;
}

export function percentErrorText(reason: Exclude<ParsePercentResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'empty':
      return 'Enter a percentage';
    case 'invalid':
      return "That doesn't look like a percentage";
    case 'too-many-decimals':
      return 'Use at most 2 decimals';
    case 'too-large':
      return 'That is more than 100%';
  }
}
