/** Calendar-day helpers for the bill date (YYYY-MM-DD). UTC arithmetic so DST never shifts a day. */

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function todayIso(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1] ?? '', 10);
  const mo = parseInt(m[2] ?? '', 10);
  const d = parseInt(m[3] ?? '', 10);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Move a valid ISO date by whole days. Invalid input is returned unchanged. */
export function shiftDay(iso: string, days: number): string {
  if (!isIsoDate(iso)) return iso;
  const [y, mo, d] = iso.split('-').map((x) => parseInt(x, 10)) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}
