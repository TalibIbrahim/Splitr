/**
 * E4/E5 backup helpers and the E6 merge. Pure and React-free (tested in Node).
 */
import { PersistedRootSchema, SCHEMA_VERSION, type Bill, type CardOffer, type PersistedRoot, type Person } from '@splitr/shared-types';

export type RestoreMode = 'replace' | 'merge';

export interface BackupEnvelope {
  app: 'splitr';
  kind: 'backup';
  schemaVersion: 1;
  exportedAt: string;
  root: PersistedRoot;
}

export type ParseBackupResult =
  | { ok: true; root: PersistedRoot }
  | { ok: false; reason: 'not-json' | 'not-a-backup' | 'newer-version' | 'invalid' };

/** E4. Receipt images stay on the device, so `receipt` (its uris and draft) is dropped from every bill. */
export function exportData(root: PersistedRoot, exportedAt: string = new Date().toISOString()): string {
  const bills = root.bills.map((b): Bill => {
    const { receipt: _receipt, ...rest } = b;
    void _receipt;
    return rest;
  });
  const envelope: BackupEnvelope = {
    app: 'splitr',
    kind: 'backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    root: { ...root, bills },
  };
  return JSON.stringify(envelope);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** E5. Validates a backup file's text. */
export function parseBackup(text: string): ParseBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isRecord(data) || data['app'] !== 'splitr' || data['kind'] !== 'backup' || !isRecord(data['root'])) {
    return { ok: false, reason: 'not-a-backup' };
  }
  const envVersion = data['schemaVersion'];
  const rootVersion = data['root']['schemaVersion'];
  if (
    (typeof envVersion === 'number' && envVersion > SCHEMA_VERSION) ||
    (typeof rootVersion === 'number' && rootVersion > SCHEMA_VERSION)
  ) {
    return { ok: false, reason: 'newer-version' };
  }
  if (envVersion !== SCHEMA_VERSION) return { ok: false, reason: 'invalid' };
  const parsed = PersistedRootSchema.safeParse(data['root']);
  return parsed.success ? { ok: true, root: parsed.data } : { ok: false, reason: 'invalid' };
}

/** Replaces every string value (and object key) equal to `from` with `to`, deeply. */
function remapId<T>(value: T, from: string, to: string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v === from ? to : v;
    if (Array.isArray(v)) return v.map(walk);
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === from ? to : k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

function mergeById<T extends { id: string; updatedAt: string }>(local: readonly T[], incoming: readonly T[]): T[] {
  const out = [...local];
  const index = new Map(local.map((d, i) => [d.id, i] as const));
  for (const d of incoming) {
    const i = index.get(d.id);
    if (i === undefined) {
      index.set(d.id, out.length);
      out.push(d);
    } else if (d.updatedAt > (out[i] as T).updatedAt) out[i] = d; // tie: local wins
  }
  return out;
}

/**
 * E6 merge. By id, the later `updatedAt` wins (tie: local). `me` and the local me person stay local; an imported
 * isMe person whose displayName matches the local me is mapped onto it, otherwise it is imported as a normal person.
 */
export function mergeRoots(local: PersistedRoot, incoming: PersistedRoot): PersistedRoot {
  const localMeId = local.me?.personId ?? null;
  const localMe = localMeId === null ? undefined : local.people.find((p) => p.id === localMeId);
  const norm = (s: string): string => s.trim().toLowerCase();

  let people: Person[] = [...incoming.people];
  let groups = incoming.groups;
  let bills = incoming.bills;

  for (const p of incoming.people.filter((x) => x.isMe)) {
    if (localMe && p.id !== localMe.id && norm(p.displayName) === norm(localMe.displayName)) {
      people = people.filter((x) => x.id !== p.id);
      groups = remapId(groups, p.id, localMe.id);
      bills = remapId(bills, p.id, localMe.id);
    }
  }
  people = people.map((p) => (p.isMe && p.id !== localMeId ? { ...p, isMe: false } : p));
  // The local me document always stays as it is locally.
  people = people.filter((p) => p.id !== localMeId);

  const cards = [...(local.cards ?? [])];
  const seen = new Set(cards.map((c) => norm(c.label)));
  for (const c of incoming.cards ?? []) {
    if (!seen.has(norm(c.label))) {
      seen.add(norm(c.label));
      cards.push(c);
    }
  }
  const userOffers: CardOffer[] = [...(local.userOffers ?? [])];
  const offerIdx = new Map(userOffers.map((o, i) => [o.id, i] as const));
  const addedOn = (o: CardOffer): string => (o.source.kind === 'user' ? o.source.addedOn : '');
  for (const o of incoming.userOffers ?? []) {
    const i = offerIdx.get(o.id);
    if (i === undefined) {
      offerIdx.set(o.id, userOffers.length);
      userOffers.push(o);
    } else if (addedOn(o) > addedOn(userOffers[i] as CardOffer)) userOffers[i] = o; // tie: local wins
  }

  return {
    ...local,
    ...(local.cards || incoming.cards ? { cards } : {}),
    ...(local.userOffers || incoming.userOffers ? { userOffers } : {}),
    people: mergeById(local.people, people),
    groups: mergeById(local.groups, groups).map((g) => ({ ...g, memberIds: [...new Set(g.memberIds)] })),
    bills: mergeById(local.bills, bills),
  };
}
