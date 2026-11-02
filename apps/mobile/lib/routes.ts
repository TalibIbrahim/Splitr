import type { Href } from 'expo-router';

/**
 * Typed routes are generated from the files on disk, so links to screens another task is still adding
 * would not type-check. Build paths here and cast once.
 */
export const href = (path: string): Href => path as Href;
