export type * from './types';

import type { BasisPoints, Paisa, ToBasisPoints, ToPaisa } from './types';

export { calculateBill } from './calculate';
export { previewItemShares } from './preview';
export { allocateLargestRemainder } from './largest-remainder';

/** Validating constructor: throws RangeError unless `value` is a safe integer. */
export const toPaisa: ToPaisa = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`Not a safe integer amount of paisa: ${String(value)}`);
  }
  return (value === 0 ? 0 : value) as Paisa;
};

/** Validating constructor: throws RangeError unless `value` is a safe integer. */
export const toBasisPoints: ToBasisPoints = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`Not a safe integer number of basis points: ${String(value)}`);
  }
  return (value === 0 ? 0 : value) as BasisPoints;
};
