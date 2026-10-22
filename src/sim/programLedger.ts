import type { Player, PlayoffState, ProgramLedger, ProgramLedgerEntry, Team, TeamRecord } from '../types/sim';
import { generateRoster } from './generateRoster.ts';
import { buildDefaultStarters } from './rosterManagement.ts';

/**
 * Each CPU program's standing beyond its base rating in the league file: prestige it
 * earned through results, and roster talent from the classes it signed. The user's
 * program keeps its own prestige drift in the coach slice, so it is never advanced here.
 */

export const MIN_PRESTIGE_DRIFT = -20;
export const MAX_PRESTIGE_DRIFT = 30;
/** Earned prestige fades toward the base each year, so a program has to keep winning to stay up. */
const PRESTIGE_DRIFT_RETENTION = 0.9;

export const MIN_TALENT = -8;
export const MAX_TALENT = 8;
/** About a third of a roster turns over each year, taking that much of the old talent with it. */
const TALENT_RETENTION = 0.7;
/** Rating points per star a class lands above (or below) what a program of its prestige usually signs. */
const CLASS_TALENT_PER_STAR = 0.3;
/** Rating points an early pro departure takes off next year's roster. */
const EARLY_ENTRY_TALENT_COST = 0.8;

const CHAMPION_PRESTIGE_DRIFT = 4;
const PLAYOFF_PRESTIGE_DRIFT = 2;
const TARGET_MET_PRESTIGE_DRIFT = 1;
const MODERATE_MISS_PRESTIGE_DRIFT = -2;
const SEVERE_MISS_PRESTIGE_DRIFT = -3;

const EMPTY_ENTRY: ProgramLedgerEntry = { prestigeDrift: 0, talent: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** One season's prestige change from results against expectations. Shared by the user's program and the CPU. */
export function prestigeDriftForSeason(champion: boolean, madePlayoffs: boolean, winDiff: number): number {
  if (champion) return CHAMPION_PRESTIGE_DRIFT;
  if (madePlayoffs) return PLAYOFF_PRESTIGE_DRIFT;
  if (winDiff >= 0) return TARGET_MET_PRESTIGE_DRIFT;
  if (winDiff <= -4) return SEVERE_MISS_PRESTIGE_DRIFT;
  if (winDiff <= -2) return MODERATE_MISS_PRESTIGE_DRIFT;
  return 0;
}

/** Earned prestige after one more season: last year's drift fades, this year's result adds. */
export function nextPrestigeDrift(drift: number, seasonDelta: number): number {
  return roundTenth(clamp(drift * PRESTIGE_DRIFT_RETENTION + seasonDelta, MIN_PRESTIGE_DRIFT, MAX_PRESTIGE_DRIFT));
}

export function ledgerEntry(ledger: ProgramLedger | null | undefined, teamId: string): ProgramLedgerEntry {
  return ledger?.[teamId] ?? EMPTY_ENTRY;
}

/** The program as it stands now: base prestige plus what it has earned, kept to 1–100. */
export function effectiveProgram(team: Team, ledger: ProgramLedger | null | undefined): Team {
  const drift = ledgerEntry(ledger, team.id).prestigeDrift;
  if (drift === 0) return team;
  return { ...team, prestige: clamp(team.prestige + drift, 1, 100) };
}

/**
 * The league with every program at its current prestige: ledger drift for CPU programs,
 * and the coach's own drift for the user's program. Returns the same array when nothing moved.
 */
export function withLeaguePrestige(
  teams: Team[],
  ledger: ProgramLedger | null | undefined,
  userTeamId?: string | null,
  userDrift = 0,
): Team[] {
  let changed = false;
  const next = teams.map((team) => {
    const drift = team.id === userTeamId ? userDrift : ledgerEntry(ledger, team.id).prestigeDrift;
    if (!Number.isFinite(drift) || drift === 0) return team;
    const prestige = clamp(team.prestige + drift, 1, 100);
    if (prestige === team.prestige) return team;
    changed = true;
    return { ...team, prestige };
  });
  return changed ? next : teams;
}

// A season sims every program's roster several times a week; build each one once.
const ROSTER_CACHE_LIMIT = 512;
const rosterCache = new Map<string, Player[]>();
const starterCache = new WeakMap<Player[], string[]>();

/**
 * A CPU program's roster this season, from its current prestige and talent. Cached:
 * callers must treat the array and players as read-only.
 */
export function programRoster(team: Team, ledger: ProgramLedger | null | undefined, rosterSeed: string): Player[] {
  const entry = ledgerEntry(ledger, team.id);
  const current = effectiveProgram(team, ledger);
  const key = `${rosterSeed}|${team.id}|${current.prestige}|${entry.talent}`;
  const cached = rosterCache.get(key);
  if (cached) return cached;
  const roster = generateRoster(current, rosterSeed, entry.talent);
  if (rosterCache.size >= ROSTER_CACHE_LIMIT) {
    const oldest = rosterCache.keys().next().value;
    if (oldest !== undefined) rosterCache.delete(oldest);
  }
  rosterCache.set(key, roster);
  return roster;
}

/** The depth chart a CPU staff starts: the best player at each starting spot. */
export function programStarters(roster: Player[]): string[] {
  const cached = starterCache.get(roster);
  if (cached) return cached;
  const starters = buildDefaultStarters(roster);
  starterCache.set(roster, starters);
  return starters;
}

/** Wins a program of this prestige rank is expected to get in 12 games: 10 for the top program, 2 for the bottom. */
export function expectedWinsByTeamId(teams: Team[]): Map<string, number> {
  const ordered = [...teams].sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
  const last = Math.max(1, ordered.length - 1);
  return new Map(ordered.map((team, rank) => [team.id, 10 - (8 * rank) / last]));
}

/** Stars a program of this prestige usually signs in a class: a least-squares line over this year's league. */
function expectedClassStars(points: Array<{ prestige: number; stars: number }>): (prestige: number) => number {
  if (points.length === 0) return () => 0;
  const meanX = points.reduce((sum, p) => sum + p.prestige, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.stars, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const p of points) {
    covariance += (p.prestige - meanX) * (p.stars - meanY);
    variance += (p.prestige - meanX) ** 2;
  }
  const slope = variance > 0 ? covariance / variance : 0;
  return (prestige) => meanY + slope * (prestige - meanX);
}

export interface ProgramLedgerSeason {
  ledger: ProgramLedger | null | undefined;
  /** Base teams from the league file. */
  teams: Team[];
  recordsByTeamId: Record<string, TeamRecord>;
  playoffs: PlayoffState | null | undefined;
  /** Star ratings of each program's committed class this year. */
  classStarsByTeamId: Record<string, number[]>;
  /** Players each program lost early to the pro draft this year. */
  earlyEntrantsByTeamId: Record<string, number>;
  userTeamId?: string | null;
  year: number;
}

/**
 * Fold one finished season into the ledger: results move prestige, the signing class
 * and early pro departures move talent. The user's program is left as it was.
 */
export function advanceProgramLedger(season: ProgramLedgerSeason): ProgramLedger {
  const current = withLeaguePrestige(season.teams, season.ledger);
  const cpuTeams = current.filter((team) => team.id !== season.userTeamId);
  const expectedWins = expectedWinsByTeamId(current);
  const seeds = new Set((season.playoffs?.seeds ?? []).map((seed) => seed.teamId));
  const champion = season.playoffs?.championTeamId ?? null;

  const classTotals = cpuTeams.map((team) => ({
    team,
    stars: (season.classStarsByTeamId[team.id] ?? []).reduce((sum, value) => sum + value, 0),
  }));
  const expectedStars = expectedClassStars(classTotals.map(({ team, stars }) => ({ prestige: team.prestige, stars })));

  const next: ProgramLedger = { ...(season.ledger ?? {}) };
  for (const { team, stars } of classTotals) {
    const entry = ledgerEntry(season.ledger, team.id);
    const record = season.recordsByTeamId[team.id];
    const wins = record?.wins ?? 0;
    const winDiff = Math.round(wins - (expectedWins.get(team.id) ?? 6));
    const driftDelta = prestigeDriftForSeason(champion === team.id, seeds.has(team.id), winDiff);
    const prestigeDrift = nextPrestigeDrift(entry.prestigeDrift, driftDelta);

    const classEdge = (stars - expectedStars(team.prestige)) * CLASS_TALENT_PER_STAR;
    const departures = (season.earlyEntrantsByTeamId[team.id] ?? 0) * EARLY_ENTRY_TALENT_COST;
    const talent = roundTenth(clamp(entry.talent * TALENT_RETENTION + classEdge - departures, MIN_TALENT, MAX_TALENT));

    const commits = season.classStarsByTeamId[team.id] ?? [];
    next[team.id] = {
      prestigeDrift,
      talent,
      lastClass: {
        year: season.year,
        commits: commits.length,
        averageStars: commits.length > 0 ? Math.round((stars / commits.length) * 100) / 100 : 0,
      },
    };
  }
  return next;
}

/**
 * The ledger a year's pro draft is built from: the one before that season was added,
 * so the draft does not change when the season is finalized.
 */
export function draftLedger(season: { year: number; programLedger?: ProgramLedger; programLedgerYear?: number | null; programLedgerBefore?: ProgramLedger }): ProgramLedger | undefined {
  return season.programLedgerYear === season.year && season.programLedgerBefore ? season.programLedgerBefore : season.programLedger;
}
