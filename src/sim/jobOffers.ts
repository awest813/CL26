import type { JobOffer, Team } from '../types/sim';
import { seedToNumber } from './rng';

/** Below this score after the season is recorded, the AD ends the job. */
export const FIRED_JOB_SECURITY = 20;
const OFFER_JOB_SECURITY = 68;

export type Employment = 'ACTIVE' | 'FIRED';

export interface SeasonJobMarket {
  employment: Employment;
  offers: JobOffer[];
}

function offerTier(teamPrestige: number, effectivePrestige: number): JobOffer['tier'] {
  if (teamPrestige > effectivePrestige) return 'UPGRADE';
  if (teamPrestige < effectivePrestige) return 'STEP_DOWN';
  return 'LATERAL';
}

function landingOffer(
  teams: Team[],
  userTeamId: string,
  effectivePrestige: number,
  seasonSeed: number,
  year: number,
  taken: Set<string>,
): JobOffer | null {
  const candidates = teams
    .filter((team) => team.id !== userTeamId && !taken.has(team.id))
    .map((team) => ({
      team,
      sortKey: seedToNumber(`${seasonSeed}:${year}:${userTeamId}:landing:${team.id}`),
    }))
    .sort((a, b) => {
      const aDown = a.team.prestige <= effectivePrestige ? 0 : 1;
      const bDown = b.team.prestige <= effectivePrestige ? 0 : 1;
      if (aDown !== bDown) return aDown - bDown;
      const prestigeOrder = aDown === 0
        ? b.team.prestige - a.team.prestige
        : a.team.prestige - b.team.prestige;
      if (prestigeOrder !== 0) return prestigeOrder;
      return a.sortKey - b.sortKey;
    });

  const pick = candidates[0];
  if (!pick) return null;
  return {
    teamId: pick.team.id,
    tier: offerTier(pick.team.prestige, effectivePrestige) === 'UPGRADE' ? 'LATERAL' : offerTier(pick.team.prestige, effectivePrestige),
    presentedAtYear: year,
  };
}

/**
 * Strong seasons open a step up. A firing always includes somewhere to land,
 * including a step down when no better seat is open.
 */
export function buildSeasonJobMarket(input: {
  teams: Team[];
  userTeamId: string;
  seasonSeed: number;
  year: number;
  jobSecurity: number;
  champion: boolean;
  effectivePrestige: number;
}): SeasonJobMarket {
  const employment: Employment = input.jobSecurity < FIRED_JOB_SECURITY ? 'FIRED' : 'ACTIVE';
  const offers: JobOffer[] = [];

  if (input.jobSecurity >= OFFER_JOB_SECURITY || input.champion) {
    const upgrades = input.teams
      .filter((team) => team.id !== input.userTeamId && team.prestige >= input.effectivePrestige)
      .map((team) => ({
        team,
        sortKey: seedToNumber(`${input.seasonSeed}:${input.year}:${input.userTeamId}:${team.id}`),
      }))
      .sort((a, b) => {
        const prestigeComparison = b.team.prestige - a.team.prestige;
        if (prestigeComparison !== 0) return prestigeComparison;
        return a.sortKey - b.sortKey;
      })
      .slice(0, input.champion ? 2 : 1)
      .map(({ team }) => ({
        teamId: team.id,
        tier: offerTier(team.prestige, input.effectivePrestige),
        presentedAtYear: input.year,
      }));
    offers.push(...upgrades);
  }

  if (employment === 'FIRED' && offers.length === 0) {
    const landing = landingOffer(
      input.teams,
      input.userTeamId,
      input.effectivePrestige,
      input.seasonSeed,
      input.year,
      new Set(offers.map((offer) => offer.teamId)),
    );
    if (landing) offers.push(landing);
  }

  return { employment, offers };
}
