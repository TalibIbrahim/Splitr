import { z } from 'zod';

/** Array schema whose inferred type is a readonly array (matches the engine types and prevents mutation). */
export const arr = <T extends z.ZodType>(element: T) => z.array(element).readonly();
