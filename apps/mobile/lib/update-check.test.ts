import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, compareSemver, isTrustedReleaseUrl, pickLatest, shouldCheck } from './update-check';

describe('compareSemver', () => {
  it('orders core versions numerically', () => {
    expect(compareSemver('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
  });
  it('orders prereleases below the release and by identifier', () => {
    expect(compareSemver('1.0.0-beta.1', '1.0.0-beta.2')).toBeLessThan(0);
    expect(compareSemver('1.0.0-beta.2', '1.0.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.0.0-beta.9')).toBeGreaterThan(0);
  });
});

describe('pickLatest', () => {
  it('skips drafts, includes prereleases, picks newest by semver', () => {
    const r = pickLatest([
      { tag_name: 'v1.0.0-beta.1', html_url: 'a' },
      { tag_name: 'v1.1.0', html_url: 'draft', draft: true },
      { tag_name: 'v1.0.0-beta.2', html_url: 'b', prerelease: true },
    ]);
    expect(r).toEqual({ latestVersion: '1.0.0-beta.2', latestUrl: 'b' });
  });
  it('returns null when empty', () => {
    expect(pickLatest([])).toBeNull();
  });
});

describe('shouldCheck', () => {
  const now = '2026-11-03T12:00:00.000Z';
  it('checks when never checked', () => expect(shouldCheck(undefined, now)).toBe(true));
  it('does not check when disabled', () => expect(shouldCheck({ enabled: false }, now)).toBe(false));
  it('waits 24 h', () => {
    expect(shouldCheck({ lastCheckedAt: '2026-11-03T00:00:00.000Z' }, now)).toBe(false);
    expect(shouldCheck({ lastCheckedAt: '2026-11-02T11:59:00.000Z' }, now)).toBe(true);
  });
});

describe('checkForUpdate', () => {
  const ok = (body: unknown) =>
    vi.fn<(u: unknown, i?: RequestInit) => Promise<Response>>(async () => ({ ok: true, json: async () => body }) as Response);
  it('sends only the Accept header', async () => {
    const f = ok([{ tag_name: 'v1.2.0', html_url: 'u' }]);
    expect(await checkForUpdate('1.0.0', f as unknown as typeof fetch)).toEqual({
      latestVersion: '1.2.0',
      latestUrl: 'u',
    });
    expect(f.mock.calls[0]?.[1]?.headers).toEqual({ Accept: 'application/vnd.github+json' });
  });
  it('returns null on network error, bad status or bad body', async () => {
    const boom = vi.fn(async () => Promise.reject(new Error('x')));
    const bad = vi.fn(async () => ({ ok: false }) as Response);
    expect(await checkForUpdate('1.0.0', boom as unknown as typeof fetch)).toBeNull();
    expect(await checkForUpdate('1.0.0', bad as unknown as typeof fetch)).toBeNull();
    expect(await checkForUpdate('1.0.0', ok({ nope: 1 }) as unknown as typeof fetch)).toBeNull();
  });
});

describe('isTrustedReleaseUrl', () => {
  it('accepts only this repo on github.com', () => {
    expect(isTrustedReleaseUrl('https://github.com/TalibIbrahim/Splitr/releases/tag/v1')).toBe(true);
    expect(isTrustedReleaseUrl('https://evil.com/https://github.com/TalibIbrahim/Splitr/')).toBe(false);
  });
});
