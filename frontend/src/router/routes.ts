/**
 * The route table.
 *
 * Every page has its own addressable path, served after the `#` so the app
 * works from any static host or file path with no server rewrite rules.
 * Keeping the list in one place is what lets the router reject unknown hashes
 * and lets the nav helpers stay in sync with the pages that exist.
 */

export const SCREENS = [
  'intro',
  'menu',
  'garage',
  'leaderboard',
  'settings',
  'character',
  'car',
  'track',
  'mode',
  'race',
  'results',
] as const;

export type Screen = (typeof SCREENS)[number];

/** Where an unrecognised or empty URL lands. */
export const HOME: Screen = 'intro';

/** Where "< BACK" goes from each page. Pages without an entry have no back. */
export const BACK_TARGET: Partial<Record<Screen, Screen>> = {
  garage: 'menu',
  leaderboard: 'menu',
  settings: 'menu',
  character: 'menu',
  car: 'character',
  track: 'car',
  mode: 'track',
};

/** Path for a screen, e.g. `menu` -> `#/menu`. */
export function toHash(screen: Screen): string {
  return `#/${screen}`;
}

/** Screen for a `location.hash`, or null when it is empty or unrecognised. */
export function fromHash(hash: string): Screen | null {
  const name = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return (SCREENS as readonly string[]).includes(name) ? (name as Screen) : null;
}