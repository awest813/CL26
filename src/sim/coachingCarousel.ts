import type { CarouselMove, ProgramCoach, ProgramCoaches, Team, TeamRecord } from '../types/sim.ts';
import { makeRng, randInt, seedToNumber } from './rng.ts';
import { drawName } from './names.ts';

/**
 * The coaching carousel: every CPU program has a head coach who stays until he is fired,
 * retires, resigns, or moves up. After each season the openings are filled from the bottom
 * of the profession up: coordinators, retreads, assistants off your staff, and head coaches
 * who won at a smaller program, whose own seats then open in turn.
 *
 * A head coach's rating (40–99, the scale the user's head coach uses) moves a program two ways:
 * his staff recruits harder or softer (`coachRecruitingPull`), and his players develop more or
 * less each year (`coachDevelopmentEdge`). A league-average coach (70) does neither.
 */

const MIN_RATING = 40;
const MAX_RATING = 99;
/** A league-average head coach: no recruiting or development edge. */
export const AVERAGE_COACH_RATING = 70;
/** At or above this age a coach who leaves retires rather than looking for another job. */
const RETIREMENT_AGE = 63;
/** Seasons at a program before a head coach is a candidate for a bigger one. */
const SEASONS_BEFORE_MOVING_UP = 2;
/** How much bigger (in prestige) a job has to be before a sitting head coach leaves for it. */
const MOVE_UP_GAP = 6;
/** A coach leaving his program has to have won this share of his games last season to be called. */
const MOVE_UP_WIN_SHARE = 0.6;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampRating = (value: number) => clamp(Math.round(value), MIN_RATING, MAX_RATING);

/** -1 for the worst coach, 0 at 70, 1 at 100. */
function coachEdge(rating: number): number {
  return clamp((rating - AVERAGE_COACH_RATING) / 30, -1, 1);
}

/** How hard his staff recruits: 0.85x for the worst coach up to 1.15x for the best. */
export function coachRecruitingPull(rating: number | undefined): number {
  return rating == null ? 1 : 1 + coachEdge(rating) * 0.15;
}

/** Roster rating points his players gain on the program's ledger each year: -0.8 to +0.8. */
export function coachDevelopmentEdge(rating: number | undefined): number {
  return rating == null ? 0 : Math.round(coachEdge(rating) * 0.8 * 100) / 100;
}

/** The head coach a program of this prestige usually has: 62 at prestige 50, 80 at 90. */
export function programCoachLevel(prestige: number): number {
  return 40 + prestige * 0.45;
}

/** What the program's original coach looks like: better programs keep better coaches. */
function originalCoach(team: Team, year: number, names: Set<string>): ProgramCoach {
  // Seeded by the program alone, so a save without coaches always sees the same ones.
  const rng = makeRng(seedToNumber(`program-coach:${team.id}`));
  const tenure = randInt(rng, 0, 12);
  return {
    id: `hc-${team.id}-original`,
    name: drawName(rng, names),
    age: randInt(rng, 36, 62),
    rating: clampRating(programCoachLevel(team.prestige) + randInt(rng, -8, 8)),
    hiredYear: year - tenure,
    wins: 0,
    losses: 0,
    titles: 0,
    background: 'original',
  };
}

/** Every CPU program's head coach as the league starts. The user's program has none. */
export function initialProgramCoaches(teams: Team[], year: number, userTeamId?: string | null): ProgramCoaches {
  const names = new Set<string>();
  const coaches: ProgramCoaches = {};
  [...teams].sort((a, b) => a.id.localeCompare(b.id)).forEach((team) => {
    if (team.id === userTeamId) return;
    coaches[team.id] = originalCoach(team, year, names);
  });
  return coaches;
}

/** The stored coaches, or the league's originals on a save from before the carousel. */
export function programCoachesOrInitial(
  stored: ProgramCoaches | null | undefined,
  teams: Team[],
  year: number,
  userTeamId?: string | null,
): ProgramCoaches {
  if (stored && Object.keys(stored).length > 0) return stored;
  return initialProgramCoaches(teams, year, userTeamId);
}

export interface AssistantHire {
  teamId: string;
  name: string;
  /** His assistant rating, 40–95. */
  rating: number;
  age: number;
}

export interface CarouselInput {
  coaches: ProgramCoaches;
  /** Programs at their current prestige. */
  teams: Team[];
  records: Record<string, TeamRecord>;
  /** Wins each program was expected to get (see `expectedWinsByTeamId`). */
  expectedWins: Map<string, number>;
  championTeamId: string | null;
  year: number;
  seed: number;
  userTeamId: string | null;
  /** Programs whose head coach is leaving this offseason (see `programOpenings`). */
  openings: Set<string>;
  /** Open jobs that called the user: they wait for his answer and are filled when the next season begins. */
  heldForUser: Set<string>;
  /** The user's assistants who were hired away as head coaches, and where. */
  assistantHires: AssistantHire[];
}

export interface CarouselResult {
  coaches: ProgramCoaches;
  news: CarouselMove[];
}

/** A coach who left a program this offseason and is looking for another. */
interface Retread {
  coach: ProgramCoach;
  from: string;
}

interface Candidate {
  coach: ProgramCoach;
  /** The program he would leave, for a sitting head coach. */
  sittingAt?: string;
  /** The program that let him go, for a retread. */
  retreadFrom?: string;
  /** Rating with what a hiring committee weighs on top: a proven head coach, or one who was let go. */
  score: number;
}

/** The best rating a program of this standing can draw: a top program can hire anyone. */
function appealCap(prestige: number): number {
  return 52 + prestige * 0.5;
}

function recordText(coach: ProgramCoach, year: number) {
  return {
    wins: coach.wins,
    losses: coach.losses,
    seasons: Math.max(1, coach.seasons ?? 1),
    tenure: Math.max(1, year - coach.hiredYear + 1),
  };
}

/** A season on the books: age, the record at this program, and a rating that follows results. */
function afterSeason(coach: ProgramCoach, input: CarouselInput, teamId: string, prestige: number): ProgramCoach {
  const record = input.records[teamId];
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const winDiff = wins - (input.expectedWins.get(teamId) ?? 6);
  const champion = input.championTeamId === teamId;
  const ageCurve = coach.age < 40 ? 1 : coach.age >= 60 ? -1 : 0;
  // Reputations settle back toward what a program of this standing usually has, a tenth of the gap a year.
  const settle = (programCoachLevel(prestige) - coach.rating) * 0.1;
  const rating = clampRating(coach.rating + clamp(Math.round(winDiff / 2), -2, 2) + (champion ? 2 : 0) + ageCurve + settle);
  return {
    ...coach,
    age: coach.age + 1,
    rating,
    wins: coach.wins + wins,
    losses: coach.losses + losses,
    titles: coach.titles + (champion ? 1 : 0),
    seasons: (coach.seasons ?? 0) + 1,
  };
}

/**
 * One offseason of head-coaching changes. Coaches age and their ratings follow results;
 * programs in `openings` lose their coach (fired after a bad miss, retired if he is 63 or
 * older, otherwise resigned); and the oldest retire on their own. Openings are filled from
 * the most prestigious down, each with the best coach it can draw. A head coach who wins at
 * a smaller program moves up, and his seat joins the openings. Jobs held for the user stay
 * empty until the next season begins.
 */
export function runCoachingCarousel(input: CarouselInput): CarouselResult {
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const prestigeOf = (teamId: string) => teamById.get(teamId)?.prestige ?? 50;
  const names = new Set(Object.values(input.coaches).map((coach) => coach.name));
  const news: CarouselMove[] = [];
  const coaches: ProgramCoaches = {};

  // 1. The season goes on every coach's record.
  for (const [teamId, coach] of Object.entries(input.coaches)) {
    if (teamId === input.userTeamId || !teamById.has(teamId)) continue;
    coaches[teamId] = afterSeason(coach, input, teamId, prestigeOf(teamId));
  }

  // 2. Departures.
  const open: string[] = [];
  const retreads: Retread[] = [];
  const leave = (teamId: string, kind: CarouselMove['kind']) => {
    const coach = coaches[teamId];
    if (!coach) return;
    news.push({ kind, teamId, coachName: coach.name, rating: coach.rating, record: recordText(coach, input.year) });
    if (kind !== 'retired') retreads.push({ coach, from: teamId });
    delete coaches[teamId];
  };
  for (const teamId of Object.keys(coaches).sort()) {
    const coach = coaches[teamId];
    const rng = makeRng(seedToNumber(`${input.seed}:${input.year}:carousel-leave:${teamId}`));
    if (input.openings.has(teamId)) {
      const shortfall = (input.expectedWins.get(teamId) ?? 6) - (input.records[teamId]?.wins ?? 0);
      leave(teamId, coach.age >= RETIREMENT_AGE ? 'retired' : shortfall >= 2 ? 'fired' : 'resigned');
      open.push(teamId);
    } else if (coach.age >= 67 && rng() < 0.25 + (coach.age - 67) * 0.1) {
      leave(teamId, 'retired');
      open.push(teamId);
    }
  }
  // A program the user just left, or a seat that was never filled, is open too.
  for (const team of input.teams) {
    if (team.id !== input.userTeamId && !coaches[team.id] && !open.includes(team.id)) open.push(team.id);
  }

  // 3. Fill the openings, the biggest jobs first.
  const filled = fillOpenings({
    coaches,
    open,
    retreads,
    names,
    prestigeOf,
    input,
  });
  news.push(...filled);
  return { coaches, news };
}

/**
 * Fill every open seat (except jobs held for the user). Mutates `coaches`; returns the hires.
 * A sitting head coach who takes a bigger job opens his old seat, which is filled in turn.
 */
function fillOpenings(context: {
  coaches: ProgramCoaches;
  open: string[];
  retreads: Retread[];
  names: Set<string>;
  prestigeOf: (teamId: string) => number;
  input: Pick<CarouselInput, 'year' | 'seed' | 'userTeamId' | 'heldForUser' | 'assistantHires' | 'records'>;
}): CarouselMove[] {
  const { coaches, retreads, names, prestigeOf, input } = context;
  const hires: CarouselMove[] = [];
  const queue = context.open.filter((teamId) => teamId !== input.userTeamId && !input.heldForUser.has(teamId));
  const handled = new Set<string>();
  const movedThisCycle = new Set<string>();
  const assistantByTeam = new Map(input.assistantHires.map((hire) => [hire.teamId, hire]));

  while (queue.length > 0) {
    queue.sort((a, b) => prestigeOf(b) - prestigeOf(a) || a.localeCompare(b));
    const teamId = queue.shift()!;
    if (handled.has(teamId)) continue;
    handled.add(teamId);
    const prestige = prestigeOf(teamId);
    const rng = makeRng(seedToNumber(`${input.seed}:${input.year}:carousel-hire:${teamId}`));

    // One of your assistants already took this job.
    const assistant = assistantByTeam.get(teamId);
    if (assistant) {
      const coach: ProgramCoach = {
        id: `hc-${teamId}-${input.year}`,
        name: assistant.name,
        age: assistant.age,
        // A coordinator's first head job: a step below his assistant rating.
        rating: clampRating(assistant.rating - 4),
        hiredYear: input.year + 1,
        wins: 0,
        losses: 0,
        titles: 0,
        background: 'your-staff',
        ...(input.userTeamId ? { fromTeamId: input.userTeamId } : {}),
      };
      names.add(coach.name);
      coaches[teamId] = coach;
      hires.push({ kind: 'hired', teamId, coachName: coach.name, rating: coach.rating, background: 'your-staff', fromTeamId: coach.fromTeamId });
      continue;
    }

    const candidates: Candidate[] = [];
    // Head coaches who won at a smaller program and have been there long enough to move.
    for (const [sittingAt, coach] of Object.entries(coaches)) {
      if (movedThisCycle.has(coach.id) || coach.hiredYear > input.year - SEASONS_BEFORE_MOVING_UP + 1) continue;
      if (prestigeOf(sittingAt) > prestige - MOVE_UP_GAP) continue;
      const record = input.records[sittingAt];
      const games = (record?.wins ?? 0) + (record?.losses ?? 0);
      if (games === 0 || (record?.wins ?? 0) / games < MOVE_UP_WIN_SHARE) continue;
      candidates.push({ coach, sittingAt, score: coach.rating + 3 });
    }
    // Coaches let go elsewhere: known quantities, marked down.
    retreads
      .filter((retread) => retread.from !== teamId)
      .forEach((retread) => candidates.push({ coach: retread.coach, retreadFrom: retread.from, score: retread.coach.rating - 4 }));
    // Coordinators ready for their first head job.
    for (let i = 0; i < 3; i += 1) {
      const coach: ProgramCoach = {
        id: `hc-${teamId}-${input.year}-${i}`,
        name: drawName(rng, names),
        age: randInt(rng, 33, 52),
        // An unproven head coach: a notch under what the program has had.
        rating: clampRating(40 + prestige * 0.4 + randInt(rng, -8, 8)),
        hiredYear: input.year + 1,
        wins: 0,
        losses: 0,
        titles: 0,
        background: 'coordinator',
      };
      names.delete(coach.name);
      candidates.push({ coach, score: coach.rating });
    }

    const cap = appealCap(prestige);
    const pick = candidates
      .filter((candidate) => candidate.coach.rating <= cap)
      .sort((a, b) => b.score - a.score || a.coach.id.localeCompare(b.coach.id))[0]
      // Every program can find somebody: the least of the coordinators.
      ?? candidates.filter((candidate) => !candidate.sittingAt).sort((a, b) => a.coach.rating - b.coach.rating)[0];

    const hire: ProgramCoach = {
      ...pick.coach,
      ...(pick.coach.background === 'coordinator' ? {} : {
        id: `hc-${teamId}-${input.year}-${pick.coach.id}`,
        hiredYear: input.year + 1,
        wins: 0,
        losses: 0,
        titles: 0,
        background: pick.sittingAt ? 'head-coach' as const : 'retread' as const,
      }),
    };
    if (pick.sittingAt) {
      hire.fromTeamId = pick.sittingAt;
      movedThisCycle.add(hire.id);
      delete coaches[pick.sittingAt];
      queue.push(pick.sittingAt);
      handled.delete(pick.sittingAt);
    } else if (pick.retreadFrom) {
      hire.fromTeamId = pick.retreadFrom;
      retreads.splice(retreads.findIndex((retread) => retread.coach === pick.coach), 1);
    } else {
      delete hire.fromTeamId;
    }
    names.add(hire.name);
    coaches[teamId] = hire;
    hires.push({
      kind: 'hired',
      teamId,
      coachName: hire.name,
      rating: hire.rating,
      background: hire.background,
      ...(hire.fromTeamId ? { fromTeamId: hire.fromTeamId } : {}),
    });
  }
  return hires;
}

/**
 * Seats still empty when a season begins (jobs the user turned down, the program he left,
 * the one that fired him) get a coach. No chain: sitting coaches have settled for the year.
 */
export function fillVacantPrograms(input: {
  coaches: ProgramCoaches;
  teams: Team[];
  userTeamId: string | null;
  year: number;
  seed: number;
}): CarouselResult {
  const coaches: ProgramCoaches = { ...input.coaches };
  // The user's program is his.
  if (input.userTeamId) delete coaches[input.userTeamId];
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const open = input.teams.map((team) => team.id).filter((teamId) => teamId !== input.userTeamId && !coaches[teamId]);
  if (open.length === 0) return { coaches, news: [] };
  const news = fillOpenings({
    coaches,
    open,
    retreads: [],
    names: new Set(Object.values(coaches).map((coach) => coach.name)),
    prestigeOf: (teamId) => teamById.get(teamId)?.prestige ?? 50,
    input: {
      year: input.year - 1,
      seed: input.seed,
      userTeamId: input.userTeamId,
      heldForUser: new Set(),
      assistantHires: [],
      // Nobody moves up in the preseason.
      records: {},
    },
  });
  return { coaches, news };
}
