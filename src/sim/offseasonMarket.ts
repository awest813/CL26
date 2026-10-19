import type { Player, Position, Team, TeamRecord } from '../types/sim';
import namesData from '../data/names.json' with { type: 'json' };
import { makeRng, pickOne, randInt, seedToNumber } from './rng';

export const PORTAL_CLAIM_CAP = 3;
export const DRAFT_BOARD_SIZE = 64;

const POSITIONS: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
const ARCHETYPES = ['RECRUITER', 'TACTICIAN', 'DEVELOPER'] as const;

export type StaffArchetype = (typeof ARCHETYPES)[number];

export interface PortalEntrant {
  id: string;
  name: string;
  position: Position;
  year: 1 | 2 | 3 | 4;
  age: number;
  overall: number;
  originTeamId: string;
  originName: string;
}

export interface DraftProspect {
  id: string;
  name: string;
  position: Position;
  stars: number;
  potential: number;
}

export interface StaffCoach {
  id: string;
  name: string;
  archetype: StaffArchetype;
  age: number;
  skill: number;
  teamId: string;
  hiring: boolean;
}

const clampRating = (value: number) => Math.max(40, Math.min(99, Math.round(value)));

function classYear(roll: number): 1 | 2 | 3 | 4 {
  if (roll > 92) return 4;
  if (roll > 55) return 3;
  if (roll > 20) return 2;
  return 1;
}

export function buildPortalBoard(teams: Team[], userTeamId: string, seed: number, year: number): PortalEntrant[] {
  const bag = teams.filter((team) => team.id !== userTeamId);
  const rng = makeRng(seedToNumber(`${seed}:${year}:portal`));
  const count = Math.min(24, bag.length);
  const board: PortalEntrant[] = [];

  for (let index = 0; index < count; index += 1) {
    const origin = bag.splice(randInt(rng, 0, bag.length - 1), 1)[0];
    const position = pickOne(rng, POSITIONS);
    const yearInSchool = classYear(randInt(rng, 1, 100));
    const overall = clampRating(48 + origin.prestige * 0.35 + randInt(rng, -8, 8));
    board.push({
      id: `portal-${seed}-${year}-${index + 1}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      position,
      year: yearInSchool,
      age: 17 + yearInSchool,
      overall,
      originTeamId: origin.id,
      originName: origin.schoolName,
    });
  }

  return board.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
}

export function buildDraftBoard(seed: number, year: number): DraftProspect[] {
  const rng = makeRng(seedToNumber(`${seed}:${year}:draft`));
  return Array.from({ length: DRAFT_BOARD_SIZE }, (_, index) => {
    const starsRoll = randInt(rng, 1, 100);
    const stars = starsRoll > 97 ? 5 : starsRoll > 82 ? 4 : starsRoll > 48 ? 3 : 2;
    return {
      id: `draft-${seed}-${year}-${index + 1}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      position: pickOne(rng, POSITIONS),
      stars,
      potential: clampRating(58 + stars * 7 + randInt(rng, -5, 6)),
    };
  });
}

export function draftValue(prospect: DraftProspect): number {
  return prospect.stars * 100 + prospect.potential;
}

export function orderDraftBoard(board: DraftProspect[]): DraftProspect[] {
  return [...board].sort((a, b) => draftValue(b) - draftValue(a) || a.id.localeCompare(b.id));
}

/** Zero-based slot. Fewer wins pick earlier. */
export function draftPickIndex(
  teamId: string,
  teams: Team[],
  records: Record<string, Pick<TeamRecord, 'wins' | 'losses' | 'pointsFor' | 'pointsAgainst'> | undefined>,
): number {
  const ranked = [...teams].sort((a, b) => {
    const aRecord = records[a.id];
    const bRecord = records[b.id];
    const aWins = aRecord?.wins ?? 0;
    const bWins = bRecord?.wins ?? 0;
    if (aWins !== bWins) return aWins - bWins;
    const aDiff = (aRecord?.pointsFor ?? 0) - (aRecord?.pointsAgainst ?? 0);
    const bDiff = (bRecord?.pointsFor ?? 0) - (bRecord?.pointsAgainst ?? 0);
    if (aDiff !== bDiff) return aDiff - bDiff;
    return a.schoolName.localeCompare(b.schoolName);
  });
  const index = ranked.findIndex((team) => team.id === teamId);
  return index < 0 ? ranked.length - 1 : index;
}

export function prospectsAvailableAtPick(board: DraftProspect[], pickIndex: number): DraftProspect[] {
  return orderDraftBoard(board).slice(Math.max(0, pickIndex));
}

export function buildCoachPool(teams: Team[], seed: number, year: number, userTeamId: string): StaffCoach[] {
  return teams.map((team) => {
    const rng = makeRng(seedToNumber(`${seed}:coach:${team.id}`));
    const hiringRng = makeRng(seedToNumber(`${seed}:${year}:hiring:${team.id}`));
    const skill = clampRating(40 + team.prestige * 0.45 + randInt(rng, -8, 8));
    return {
      id: `staff-${team.id}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      archetype: pickOne(rng, [...ARCHETYPES]),
      age: randInt(rng, 34, 64),
      skill,
      teamId: team.id,
      hiring: team.id !== userTeamId && hiringRng() < 0.09,
    };
  });
}

function playerFromRatings(
  id: string,
  name: string,
  position: Position,
  year: 1 | 2 | 3 | 4,
  age: number,
  overall: number,
): Player {
  const rating = clampRating(overall);
  return {
    id,
    name,
    position,
    year,
    age,
    skill: rating,
    shooting: rating,
    passing: rating,
    speed: rating,
    defense: rating,
    IQ: rating,
    stamina: rating,
    discipline: rating,
    overall: rating,
  };
}

export function entrantToPlayer(entrant: PortalEntrant): Player {
  return playerFromRatings(entrant.id, entrant.name, entrant.position, entrant.year, entrant.age, entrant.overall);
}

export function prospectToPlayer(prospect: DraftProspect): Player {
  const overall = clampRating(37 + prospect.stars * 8 + (prospect.potential - 70) * 0.15);
  return playerFromRatings(prospect.id, prospect.name, prospect.position, 1, 18, overall);
}
