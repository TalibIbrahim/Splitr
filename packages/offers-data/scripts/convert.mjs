// Usage: node scripts/convert.mjs <path-to-offers-raw.json>
// Converts the scout's raw file into src/offers.lahore.json (CardOffer[]). Deterministic.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const slug = (s) =>
  s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Raw card names carry scout notes in parentheses; keep only the card name.
const cleanCard = (s) => s.replace(/\s*\([^)]*\)/g, '').trim();
const pkr = (n) => Math.round(n * 100);

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/convert.mjs <offers-raw.json>');
const raw = JSON.parse(readFileSync(input, 'utf8'));

const used = new Set();
const out = [];
let dropped = 0;
for (const r of raw) {
  if (r.value === null || r.value === undefined) {
    dropped++;
    continue;
  }
  const cards = r.cardProducts.map(cleanCard);
  const bankSlug = slug(r.bank);
  const cardSlug = slug(cards[0]).replace(new RegExp(`^${bankSlug}-?`), "") || "all";
  const base = `${bankSlug}-${slug(r.restaurant)}-${cardSlug}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  const discount =
    r.discountType === 'percent'
      ? { type: 'percent', bp: Math.round(r.value * 100) }
      : { type: 'fixed', amount: pkr(r.value) };
  out.push({
    id,
    bank: r.bank,
    cardProducts: cards,
    restaurant: r.restaurant,
    city: r.city,
    ...(r.branches && r.branches.length ? { branches: r.branches } : {}),
    discount,
    ...(r.capPkr != null ? { capPaisa: pkr(r.capPkr) } : {}),
    ...(r.minSpendPkr != null ? { minSpendPaisa: pkr(r.minSpendPkr) } : {}),
    ...(r.days && r.days.length ? { daysOfWeek: r.days.map((d) => DAYS[d]) } : {}),
    ...(r.validFrom ? { validFrom: r.validFrom } : {}),
    ...(r.validTo ? { validTo: r.validTo } : {}),
    terms: r.terms,
    source: {
      kind: 'published',
      url: r.sourceUrl,
      title: r.sourceTitle,
      retrievedOn: r.retrievedOn,
      confidence: r.confidence,
    },
  });
}
const target = fileURLToPath(new URL('../src/offers.lahore.json', import.meta.url));
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`kept ${out.length}, dropped ${dropped}`);
