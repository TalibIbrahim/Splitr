import type { Href } from 'expo-router';

export type FlowRoute = 'items' | 'assign' | 'charges' | 'breakdown';

/** Typed-route friendly href for a bill step. */
export const billHref = (id: string, route: FlowRoute): Href => `/bill/${id}/${route}` as Href;

export const HOME_HREF = '/' as Href;
