import type { JobOffer, Team, TeamRecord } from '../types/sim';
import { makeRng, seedToNumber } from './rng';
import { expectedWinsByTeamId } from './programLedger';

/** Below this score when the season ends, the AD ends the job. */
export const FIRED_JOB_SECURITY = 20;
/** A season that meets its targets with job security at least this high draws a call. */
const OFFER_JOB_SECURITY = 60;

export type Employment = 'ACTIVE' | 'FIRED';

export interface SeasonJobMarket {
  employment: Employment;
  offers: JobOffer[];
}

/** How far above the current program a season's results can reach, in prestige points. */
const REACH_BY_RESULT = {
  champion: 18,
  playoffs: 11,
  targetMet: 6,
} as const;

/** Offers a season draws: more calls the further the team went. */
const OFFERS_BY_RESULT = {
  champion: 3,
  playoffs: 2,
  targetMet: 1,
} as const;

export type SeasonResult = keyof typeof REACH_BY_RESULT;

function offerTier(teamPrestige: number, effectivePrestige: number): JobOffer['tier'] {
  if (teamPrestige >= effectivePrestige + 3) return 'UPGRADE';
  if (teamPrestige <= effectivePrestige - 3) return 'STEP_DOWN';
  return 'LATERAL';
}

/**
 * The head-coaching jobs open after this season. A CPU staff that badly missed what its
 * program should win is let go; a few more leave or retire on their own. The user's
 * program is never on the list.
 */
export function programOpenings(input: {
  /** Programs at their current prestige. */
  teams: Team[];
  records: Record<string, TeamRecord>;
  seasonSeed: number;
  year: number;
  userTeamId: string | null;
}): Set<string> {
  const expected = expectedWinsByTeamId(input.teams);
  const openings = new Set<string>();
  for (const team of input.teams) {
    if (team.id === input.userTeamId) continue;
    const rng = makeRng(seedToNumber(`${input.seasonSeed}:${input.year}:opening:${team.id}`));
    const wins = input.records[team.id]?.wins ?? Math.round(expected.get(team.id) ?? 6);
    const shortfall = (expected.get(team.id) ?? 6) - wins;
    // Fired for results, or moving on (retirement, another job): about one in twenty.
    const chance = shortfall >= 4 ? 0.75 : shortfall >= 2.5 ? 0.4 : shortfall >= 1.5 ? 0.15 : 0.05;
    if (rng() < chance) openings.add(team.id);
  }
  return openings;
}

/** Which result a season counts as on the market, or null for a season that draws no calls. */
export function seasonResultFor(input: {
  champion: boolean;
  madePlayoffs: boolean;
  wins: number;
  winTarget: number;
  jobSecurity: number;
}): SeasonResult | null {
  if (input.champion) return 'champion';
  if (input.jobSecurity < OFFER_JOB_SECURITY) return null;
  if (input.madePlayoffs) return 'playoffs';
  if (input.wins >= input.winTarget) return 'targetMet';
  return null;
}

/** How high a season lets a coach aim, for the office copy. */
export function offerReach(result: SeasonResult): number {
  return REACH_BY_RESULT[result];
}

/**
 * The calls a season draws, from programs with an opening. Strong seasons reach higher,
 * and a title draws three. A firing always includes somewhere to land: the best open
 * seat at or below the program the coach is leaving, or failing that any open seat.
 */
export function buildSeasonJobMarket(input: {
  /** Programs at their current prestige. */
  teams: Team[];
  userTeamId: string;
  seasonSeed: number;
  year: number;
  jobSecurity: number;
  champion: boolean;
  madePlayoffs?: boolean;
  wins?: number;
  winTarget?: number;
  effectivePrestige: number;
  /** Open head-coaching jobs (see `programOpenings`). Without it every other program is open. */
  openings?: Set<string>;
}): SeasonJobMarket {
  const employment: Employment = input.jobSecurity < FIRED_JOB_SECURITY ? 'FIRED' : 'ACTIVE';
  const open = input.teams.filter((team) => team.id !== input.userTeamId && (!input.openings || input.openings.has(team.id)));
  const tieBreak = (teamId: string) => seedToNumber(`${input.seasonSeed}:${input.year}:${input.userTeamId}:${teamId}`);
  const offers: JobOffer[] = [];

  const result = employment === 'FIRED'
    ? null
    : seasonResultFor({
        champion: input.champion,
        madePlayoffs: input.madePlayoffs ?? false,
        wins: input.wins ?? 0,
        winTarget: input.winTarget ?? 99,
        jobSecurity: input.jobSecurity,
      });
  if (result) {
    const ceiling = input.effectivePrestige + REACH_BY_RESULT[result];
    // Calls come from programs at least as good as this one and within reach of the season.
    open
      .filter((team) => team.prestige >= input.effectivePrestige - 2 && team.prestige <= ceiling)
      .sort((a, b) => b.prestige - a.prestige || tieBreak(a.id) - tieBreak(b.id))
      .slice(0, OFFERS_BY_RESULT[result])
      .forEach((team) => offers.push({ teamId: team.id, tier: offerTier(team.prestige, input.effectivePrestige), presentedAtYear: input.year }));
  }

  if (employment === 'FIRED') {
    const landing = [...open]
      .sort((a, b) => {
        const aBelow = a.prestige <= input.effectivePrestige ? 0 : 1;
        const bBelow = b.prestige <= input.effectivePrestige ? 0 : 1;
        if (aBelow !== bBelow) return aBelow - bBelow;
        // Below: the best seat that will have him. Above (no seat below is open): the most modest.
        const order = aBelow === 0 ? b.prestige - a.prestige : a.prestige - b.prestige;
        return order || tieBreak(a.id) - tieBreak(b.id);
      })[0]
      ?? input.teams.filter((team) => team.id !== input.userTeamId).sort((a, b) => a.prestige - b.prestige)[0];
    if (landing) {
      const tier = offerTier(landing.prestige, input.effectivePrestige);
      offers.push({ teamId: landing.id, tier: tier === 'UPGRADE' ? 'LATERAL' : tier, presentedAtYear: input.year });
    }
  }

  return { employment, offers };
}
