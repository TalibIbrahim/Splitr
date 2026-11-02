import type { Eligibility, Item } from './types';

/**
 * R6.1. An include filter exists when `itemIds` or `categories` is non-empty (an empty array is treated as
 * "no filter"). Exclusion wins.
 */
export function isEligible(item: Item, e: Eligibility | undefined): boolean {
  if (!e) return true;
  const hasInclude = (e.itemIds?.length ?? 0) > 0 || (e.categories?.length ?? 0) > 0;
  if (hasInclude) {
    const byId = e.itemIds?.includes(item.id) ?? false;
    const byCat = e.categories?.some((c) => item.categories.includes(c)) ?? false;
    if (!byId && !byCat) return false;
  }
  if (e.excludeItemIds?.includes(item.id)) return false;
  if (e.excludeCategories?.some((c) => item.categories.includes(c))) return false;
  return true;
}
