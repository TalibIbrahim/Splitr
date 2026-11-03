const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

const NUMERIC = /(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/g;
const NAMED = /(?<![\d\p{L}])(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?[\s-]+(\d{4})(?!\d)/giu;

function isoOrNull(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2999) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > (lengths[month - 1] ?? 0)) return null;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${String(year)}-${p2(month)}-${p2(day)}`;
}

/**
 * P7. Finds the first valid day-first date in `text`: `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yy` or `d Mon yyyy`.
 * Two-digit years become 20yy. A date invalid day-first but valid month-first (12/31/2023) is read month-first (P7b). Other invalid dates are skipped. Returns an ISO `YYYY-MM-DD` date.
 */
export function parseDate(text: string): string | undefined {
  const found: { index: number; iso: string }[] = [];
  for (const m of text.matchAll(NUMERIC)) {
    const year = m[3] ?? '';
    const y = year.length === 2 ? 2000 + Number(year) : Number(year);
    // P7b: day-first, then month-first when day-first is invalid.
    const iso = isoOrNull(Number(m[1]), Number(m[2]), y) ?? isoOrNull(Number(m[2]), Number(m[1]), y);
    if (iso !== null) found.push({ index: m.index ?? 0, iso });
  }
  for (const m of text.matchAll(NAMED)) {
    const month = MONTHS.indexOf((m[2] ?? '').toLowerCase() as (typeof MONTHS)[number]) + 1;
    const iso = isoOrNull(Number(m[1]), month, Number(m[3]));
    if (iso !== null) found.push({ index: m.index ?? 0, iso });
  }
  found.sort((a, b) => a.index - b.index);
  return found[0]?.iso;
}

/** Character ranges of valid dates in any P7 format, so their digits are never mistaken for amounts. */
export function dateSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const re of [NAMED, NUMERIC]) {
    for (const m of text.matchAll(re)) {
      if (parseDate(m[0]) !== undefined) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  return out;
}
