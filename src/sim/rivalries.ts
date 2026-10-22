import type { Team } from '../types/sim';
import { seedToNumber } from './rng.ts';

/**
 * Annual non-conference rivalries. Each program is paired once, for good, with a school
 * from its own region in another conference, and the two play for a named trophy in the
 * last week of every regular season.
 */

export interface Rivalry {
  teamIds: [string, string];
  /** The trophy the two schools play for, e.g. "The Iron Bell". */
  trophy: string;
}

const TROPHY_MATERIALS = ['Iron', 'Bronze', 'Silver', 'Granite', 'Cedar', 'Copper', 'River', 'Old Oak'];
const TROPHY_OBJECTS = ['Stick', 'Cup', 'Crosse', 'Bell', 'Lantern', 'Anvil', 'Shield', 'Pipe'];

/** The week (0-based) that closes the regular season with every rivalry game. */
export const RIVALRY_WEEK_INDEX = 11;

const rivalryCache = new WeakMap<Team[], Rivalry[]>();

/**
 * Pair every program with an in-region rival from another conference. Stable for the
 * league file: the order comes from a hash of each school's id, never the season seed.
 * A program left without a partner (an odd region, or no other conference to pair with) has no rival.
 */
export function buildRivalries(teams: Team[]): Rivalry[] {
  const cached = rivalryCache.get(teams);
  if (cached) return cached;

  const regions = [...new Set(teams.map((team) => team.region))].sort();
  const pairs: Array<[Team, Team]> = [];
  for (const region of regions) {
    const pool = teams
      .filter((team) => team.region === region)
      .sort((a, b) => seedToNumber(`rivalry:${a.id}`) - seedToNumber(`rivalry:${b.id}`) || a.id.localeCompare(b.id));
    while (pool.length > 1) {
      const first = pool.shift() as Team;
      const partnerIndex = pool.findIndex((team) => team.conferenceId !== first.conferenceId);
      if (partnerIndex < 0) continue;
      const [partner] = pool.splice(partnerIndex, 1);
      pairs.push([first, partner]);
    }
  }

  const rivalries = pairs.map(([a, b], index) => ({
    teamIds: [a.id, b.id] as [string, string],
    trophy: `The ${TROPHY_MATERIALS[index % TROPHY_MATERIALS.length]} ${TROPHY_OBJECTS[Math.floor(index / TROPHY_MATERIALS.length) % TROPHY_OBJECTS.length]}`,
  }));
  rivalryCache.set(teams, rivalries);
  return rivalries;
}

/** The rivalry a program plays in, if it has one. */
export function rivalryFor(rivalries: Rivalry[], teamId: string): Rivalry | null {
  return rivalries.find((rivalry) => rivalry.teamIds.includes(teamId)) ?? null;
}

/** The other school in a program's rivalry. */
export function rivalOf(rivalry: Rivalry, teamId: string): string {
  return rivalry.teamIds[0] === teamId ? rivalry.teamIds[1] : rivalry.teamIds[0];
}
