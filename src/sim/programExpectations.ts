import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { prestigeStars } from './prestige.ts';

/**
 * What an AD expects from a program, read off where its prestige ranks in the league.
 * Targets follow the wins a program of that standing should get, so a rebuild is asked
 * for progress and a blue blood for a title run.
 */

export type ProgramSituation = 'REBUILD' | 'STABLE' | 'CONTENDER';

export interface ProgramExpectations {
  winTarget: number;
  rankTarget: number;
  securityBaseline: number;
}

export const SITUATION_LABELS: Record<ProgramSituation, string> = {
  REBUILD: 'Rebuild',
  STABLE: 'Stable',
  CONTENDER: 'Win now',
};

export const SITUATION_DETAILS: Record<ProgramSituation, string> = {
  REBUILD: 'A patient AD and a thin budget. Show progress; a winning record is a big year.',
  STABLE: 'Hold the program where it is: a winning record and a respectable poll finish.',
  CONTENDER: 'Big budget, short patience. The AD expects the playoffs every year.',
};

const SECURITY_BASELINE: Record<ProgramSituation, number> = {
  REBUILD: 52,
  STABLE: 58,
  CONTENDER: 64,
};

const BASE_PRESTIGE = (leagueData.teams as Team[]).map((team) => team.prestige).sort((a, b) => b - a);

/** The situation by star rating: 4½ stars and up must win now, under 2½ stars is a rebuild. */
export function situationFromPrestige(prestige: number): ProgramSituation {
  const stars = prestigeStars(prestige);
  if (stars >= 4.5) return 'CONTENDER';
  if (stars >= 2.5) return 'STABLE';
  return 'REBUILD';
}

/** Where this prestige would rank in the league, 0 for the top. */
function leagueRank(prestige: number, prestiges: number[]): number {
  return prestiges.filter((value) => value > prestige).length;
}

/**
 * Wins a program of this prestige should get in 12 games: 10 for the top of the league,
 * 2 for the bottom, the same scale CPU programs are judged on.
 */
export function expectedWinsForPrestige(prestige: number, prestiges: number[] = BASE_PRESTIGE): number {
  const last = Math.max(1, prestiges.length - 1);
  return 10 - (8 * Math.min(last, leagueRank(prestige, prestiges))) / last;
}

export function expectationsFromPrestige(prestige: number, prestiges: number[] = BASE_PRESTIGE): ProgramExpectations {
  const situation = situationFromPrestige(prestige);
  const expected = expectedWinsForPrestige(prestige, prestiges);
  const rank = leagueRank(prestige, prestiges);
  return {
    // The AD asks for a little less than par, never fewer than 3 wins or more than 9.
    winTarget: Math.max(3, Math.min(9, Math.floor(expected))),
    // A poll finish about where the program ranks, with some room.
    rankTarget: Math.max(8, Math.min(100, rank + 10)),
    securityBaseline: SECURITY_BASELINE[situation],
  };
}
