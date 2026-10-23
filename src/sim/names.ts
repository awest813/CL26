import namesData from '../data/names.json' with { type: 'json' };
import { makeRng, pickOne, seedToNumber, type RngFn } from './rng.ts';

/**
 * Player and coach names. A draw always takes exactly two values from the caller's rng
 * (first name, then last name), so the rolls that follow are the same whatever the lists hold.
 * A name that repeats one already in use, or reads "Chase Chase", is redrawn from its own
 * stream seeded by the clash, never from the caller's.
 */

const FIRST_NAMES: string[] = namesData.firstNames;
const LAST_NAMES: string[] = namesData.lastNames;
const MAX_REDRAWS = 24;

function acceptable(first: string, last: string, taken: Set<string> | undefined): boolean {
  return first !== last && !taken?.has(`${first} ${last}`);
}

/**
 * A full name. Pass `taken` (names already on the roster, board, or staff) to keep this one
 * distinct; the new name is added to it.
 */
export function drawName(rng: RngFn, taken?: Set<string>): string {
  let first = pickOne(rng, FIRST_NAMES);
  let last = pickOne(rng, LAST_NAMES);
  if (!acceptable(first, last, taken)) {
    const redraw = makeRng(seedToNumber(`name-clash:${first}:${last}:${taken?.size ?? 0}`));
    for (let attempt = 0; attempt < MAX_REDRAWS && !acceptable(first, last, taken); attempt += 1) {
      // Keep the first name when only the pair clashed; it reads as a different player either way.
      if (attempt % 2 === 1 || first === last) first = pickOne(redraw, FIRST_NAMES);
      last = pickOne(redraw, LAST_NAMES);
    }
  }
  const name = `${first} ${last}`;
  taken?.add(name);
  return name;
}
