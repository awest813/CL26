import type { Player, Position, ProgramLedger, Team } from '../types/sim';
import { drawName } from './names';
import { programRoster } from './programLedger';
import { makeRng, pickOne, randInt, seedToNumber } from './rng';

export const PORTAL_CLAIM_CAP = 3;
export const PRO_DRAFT_ROUNDS = 4;
export const EARLY_ENTRY_OVERALL = 80;

export const PRO_CLUBS = [
  { id: 'bay-lights', name: 'Bay Lights' },
  { id: 'red-canyon', name: 'Red Canyon' },
  { id: 'iron-pines', name: 'Iron Pines' },
  { id: 'metro-crown', name: 'Metro Crown' },
  { id: 'glass-city', name: 'Glass City' },
  { id: 'north-current', name: 'North Current' },
  { id: 'cedar-range', name: 'Cedar Range' },
  { id: 'tide-forge', name: 'Tide Forge' },
] as const;

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

export interface ProDraftPick {
  pick: number;
  round: number;
  clubId: string;
  clubName: string;
  playerId: string;
  playerName: string;
  position: Position;
  year: 1 | 2 | 3 | 4;
  overall: number;
  collegeId: string;
  collegeName: string;
  early: boolean;
}

export interface ProDraftInput {
  teams: Team[];
  rosterSeed: string;
  seasonSeed: number;
  year: number;
  userTeamId: string | null;
  userRoster: Player[] | null;
  /** CPU rosters at their ledger standing. Without it, programs play at base prestige. */
  ledger?: ProgramLedger | null;
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
  const names = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const origin = bag.splice(randInt(rng, 0, bag.length - 1), 1)[0];
    const position = pickOne(rng, POSITIONS);
    const yearInSchool = classYear(randInt(rng, 1, 100));
    const overall = clampRating(48 + origin.prestige * 0.35 + randInt(rng, -8, 8));
    board.push({
      id: `portal-${seed}-${year}-${index + 1}`,
      name: drawName(rng, names),
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

function shuffleClubs(seed: number, year: number): Array<(typeof PRO_CLUBS)[number]> {
  const rng = makeRng(seedToNumber(`${seed}:${year}:pro-draft`));
  const clubs = [...PRO_CLUBS];
  for (let index = clubs.length - 1; index > 0; index -= 1) {
    const swap = randInt(rng, 0, index);
    const current = clubs[index];
    clubs[index] = clubs[swap];
    clubs[swap] = current;
  }
  return clubs;
}

function rosterForDraft(team: Team, input: ProDraftInput): Player[] {
  if (team.id === input.userTeamId && input.userRoster && input.userRoster.length > 0) {
    return input.userRoster;
  }
  return programRoster(team, input.ledger, input.rosterSeed);
}

/** Seniors are always eligible. A junior at 80 or better can turn pro. */
export function isProDraftEligible(player: Player): boolean {
  if (player.year === 4) return true;
  return player.year === 3 && player.overall >= EARLY_ENTRY_OVERALL;
}

/**
 * Premier Circuit college draft. Eight clubs, four rounds.
 * The best eligible players go first. Club order is a yearly lottery.
 */
export function buildProDraft(input: ProDraftInput): ProDraftPick[] {
  const pool = input.teams.flatMap((team) =>
    rosterForDraft(team, input)
      .filter(isProDraftEligible)
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        year: player.year,
        overall: player.overall,
        collegeId: team.id,
        collegeName: team.schoolName,
      })),
  );
  pool.sort((a, b) => b.overall - a.overall || a.playerName.localeCompare(b.playerName) || a.playerId.localeCompare(b.playerId));

  const clubs = shuffleClubs(input.seasonSeed, input.year);
  const picks = Math.min(pool.length, PRO_CLUBS.length * PRO_DRAFT_ROUNDS);
  return pool.slice(0, picks).map((player, index) => {
    const club = clubs[index % clubs.length];
    return {
      pick: index + 1,
      round: Math.floor(index / clubs.length) + 1,
      clubId: club.id,
      clubName: club.name,
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      year: player.year,
      overall: player.overall,
      collegeId: player.collegeId,
      collegeName: player.collegeName,
      early: player.year < 4,
    };
  });
}

/**
 * Every program's head coach. With `openings` (see `programOpenings`), the programs in it
 * are the ones hiring; without it, a few are, at random.
 */
export function buildCoachPool(teams: Team[], seed: number, year: number, userTeamId: string, openings?: Set<string>): StaffCoach[] {
  const names = new Set<string>();
  return teams.map((team) => {
    const rng = makeRng(seedToNumber(`${seed}:coach:${team.id}`));
    const hiringRng = makeRng(seedToNumber(`${seed}:${year}:hiring:${team.id}`));
    const skill = clampRating(40 + team.prestige * 0.45 + randInt(rng, -8, 8));
    return {
      id: `staff-${team.id}`,
      name: drawName(rng, names),
      archetype: pickOne(rng, [...ARCHETYPES]),
      age: randInt(rng, 34, 64),
      skill,
      teamId: team.id,
      hiring: team.id !== userTeamId && (openings ? openings.has(team.id) : hiringRng() < 0.09),
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
    faceoff: position === 'FO' ? rating : clampRating(rating - 18),
    saving: position === 'G' ? rating : 40,
    potential: clampRating(rating + (4 - year) * 2),
  };
}

export function entrantToPlayer(entrant: PortalEntrant): Player {
  return playerFromRatings(entrant.id, entrant.name, entrant.position, entrant.year, entrant.age, entrant.overall);
}

