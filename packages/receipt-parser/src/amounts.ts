import { parseRupees } from '@splitr/bill-domain';
import type { Paisa } from '@splitr/calculation-engine';
import { dateSpans } from './date';

const CURRENCY_ONLY = /^(?:rs\.?|pkr)$/i;
const NUMBER_SHAPE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

/**
 * P2. Converts one whitespace-free token to paisa, or null when it is not an amount.
 * Accepts an optional `Rs`/`Rs.`/`PKR` prefix, thousands commas (groups of 3), `.d`/`.dd`, a trailing `/-`,
 * and a sign shown as a leading `-` or surrounding `( )`. The result is signed; callers that want a magnitude use Math.abs.
 * Rejects dates/times (`/` or `:`), percentages, tokens with a letter suffix (`2x`) and 10+ digit runs without commas.
 */
export function parseAmountToken(token: string): Paisa | null {
  let t = token.trim();
  let negative = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('/-')) t = t.slice(0, -2);
  const stripSign = (): void => {
    if (t.startsWith('-') || t.startsWith('−')) {
      negative = true;
      t = t.slice(1);
    }
  };
  stripSign();
  t = t.replace(/^(?:rs\.?|pkr)/i, '');
  stripSign();
  if (!NUMBER_SHAPE.test(t)) return null;
  const wholeDigits = (t.split('.')[0] ?? '').replace(/,/g, '');
  if (!t.includes(',') && wholeDigits.length > 9) return null;
  const parsed = parseRupees(negative ? `-${t}` : t);
  return parsed.ok ? parsed.paisa : null;
}

/** An amount found in a row's text. `start`/`end` are character offsets of the whole token (including any `Rs` prefix). */
export interface AmountToken {
  readonly value: Paisa;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * P2. Finds the amount tokens of a row, left to right. A standalone `Rs`/`PKR` token merges with the number after it.
 * A number followed by a `%` token (`16.5 %`) is a percentage, not an amount; digits inside a recognised date are not amounts.
 */
export function findAmountTokens(text: string): AmountToken[] {
  const raw = [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index ?? 0 }));
  const out: AmountToken[] = [];
  const dates = dateSpans(text); // "2 Nov 2026": the day and year are not amounts
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (tok === undefined) continue;
    if (dates.some((d) => tok.start >= d.start && tok.start < d.end)) continue;
    let tokenText = tok.text;
    let end = tok.start + tok.text.length;
    let consumed = 0;
    const next = raw[i + 1];
    if (CURRENCY_ONLY.test(tok.text) && next !== undefined) {
      tokenText = next.text;
      end = next.start + next.text.length;
      consumed = 1;
    }
    const after = raw[i + 1 + consumed];
    if (after !== undefined && after.text.startsWith('%')) {
      i += consumed;
      continue;
    }
    const value = parseAmountToken(tokenText);
    if (value !== null) {
      out.push({ value, text: text.slice(tok.start, end), start: tok.start, end });
      i += consumed;
    }
  }
  return out;
}

/** Removes the given character ranges from `text` (replaced by a space), collapsing whitespace. */
export function removeSpans(text: string, spans: readonly { start: number; end: number }[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start) + ' ';
    pos = s.end;
  }
  out += text.slice(pos);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * P2b. The row's line amount: its right-most amount token, but only when that token ends the row text
 * (ignoring a trailing `/-`, `Rs` or `PKR`). Otherwise the row has no line amount.
 */
export function lineAmount(text: string, tokens: readonly AmountToken[] = findAmountTokens(text)): AmountToken | undefined {
  const last = tokens[tokens.length - 1];
  if (last === undefined) return undefined;
  return /^(?:\s*(?:\/-|\(rs\.?\)|rs\.?|pkr))*\s*$/i.test(text.slice(last.end)) ? last : undefined;
}

/** P17. The `(Rs)` / `Rs` / `PKR` / `/-` suffix that follows the last amount of a row, as a span to remove from names. */
export function trailingSuffix(text: string): { start: number; end: number }[] {
  const m = /(?:\s*(?:\/-|\(rs\.?\)|rs\.?|pkr))+\s*$/i.exec(text);
  return m === null || m[0].trim() === '' ? [] : [{ start: m.index, end: m.index + m[0].length }];
}
