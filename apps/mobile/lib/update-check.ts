/**
 * D36 update notice: pure helpers plus one fetch. The only request is a plain HTTPS GET to the GitHub releases API
 * (no identifiers, no extra headers). Every failure is swallowed.
 */
export const RELEASES_URL = 'https://api.github.com/repos/TalibIbrahim/Splitr/releases?per_page=5';
export const RELEASE_PAGE_PREFIX = 'https://github.com/TalibIbrahim/Splitr/';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export interface Release {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateInfo {
  latestVersion: string;
  latestUrl: string;
}

interface Parsed {
  core: [number, number, number];
  pre: string[];
}

function parse(v: string): Parsed {
  const noMeta = v.trim().replace(/^v/i, '').split('+')[0] ?? '';
  const dash = noMeta.indexOf('-');
  const main = dash === -1 ? noMeta : noMeta.slice(0, dash);
  const pre = dash === -1 ? [] : noMeta.slice(dash + 1).split('.');
  const n = main.split('.').map((x) => {
    const k = Number.parseInt(x, 10);
    return Number.isFinite(k) ? k : 0;
  });
  return { core: [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0], pre };
}

/** Semver order: -1 if a < b, 0 if equal, 1 if a > b. A prerelease is lower than its release. */
export function compareSemver(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre.length === 0 && y.pre.length === 0) return 0;
  if (x.pre.length === 0) return 1;
  if (y.pre.length === 0) return -1;
  const len = Math.max(x.pre.length, y.pre.length);
  for (let i = 0; i < len; i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** Newest non-draft release (prereleases included) by semver of its tag. */
export function pickLatest(releases: readonly Release[]): UpdateInfo | null {
  let best: Release | null = null;
  for (const r of releases) {
    if (r.draft === true || !r.tag_name || !r.html_url) continue;
    if (best === null || compareSemver(r.tag_name, best.tag_name) > 0) best = r;
  }
  return best ? { latestVersion: best.tag_name.replace(/^v/i, ''), latestUrl: best.html_url } : null;
}

export function shouldCheck(
  meta: { enabled?: boolean; lastCheckedAt?: string } | undefined,
  nowIso: string,
): boolean {
  if (meta?.enabled === false) return false;
  if (!meta?.lastCheckedAt) return true;
  const last = Date.parse(meta.lastCheckedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  return now - last > DAY_MS;
}

function isRelease(x: unknown): x is Release {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.tag_name === 'string' && typeof r.html_url === 'string';
}

/**
 * Fetches the newest release, or null on any failure. The caller compares it with the running version
 * (`currentVersion` is accepted for the call-site contract only).
 */
export async function checkForUpdate(
  _currentVersion: string,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return null;
    return pickLatest(body.filter(isRelease));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True only for pages of this repo on github.com. */
export function isTrustedReleaseUrl(url: string): boolean {
  return url.startsWith(RELEASE_PAGE_PREFIX);
}
