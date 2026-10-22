import type { GameResult, Player, PlayerGameStats, PlayerSeasonLine, SeasonAward } from '../types/sim';

/**
 * Regular-season player totals, built one week at a time from the engine's box scores,
 * and the leaders and national awards that come out of them.
 */

export type SeasonStats = Record<string, PlayerSeasonLine>;

function blankLine(row: PlayerGameStats, year: Player['year']): PlayerSeasonLine {
  return {
    playerId: row.playerId,
    name: row.name,
    teamId: row.teamId,
    position: row.position,
    year,
    goals: 0,
    assists: 0,
    shots: 0,
    groundBalls: 0,
    causedTurnovers: 0,
    saves: 0,
    goalsAllowed: 0,
    faceoffWins: 0,
    faceoffsTaken: 0,
  };
}

/** Season totals with these games added. Returns a new object; the input is untouched. */
export function addGamesToSeasonStats(
  stats: SeasonStats | null | undefined,
  results: GameResult[],
  yearByPlayerId: Map<string, Player['year']>,
): SeasonStats {
  const next: SeasonStats = { ...(stats ?? {}) };
  for (const result of results) {
    for (const row of [...(result.boxScoreA ?? []), ...(result.boxScoreB ?? [])]) {
      const current = next[row.playerId] ?? blankLine(row, yearByPlayerId.get(row.playerId) ?? 1);
      next[row.playerId] = {
        ...current,
        goals: current.goals + row.goals,
        assists: current.assists + row.assists,
        shots: current.shots + (row.shots ?? 0),
        groundBalls: current.groundBalls + (row.groundBalls ?? 0),
        causedTurnovers: current.causedTurnovers + (row.causedTurnovers ?? 0),
        saves: current.saves + row.saves,
        goalsAllowed: current.goalsAllowed + (row.goalsAllowed ?? 0),
        faceoffWins: current.faceoffWins + (row.faceoffWins ?? 0),
        faceoffsTaken: current.faceoffsTaken + (row.faceoffsTaken ?? 0),
      };
    }
  }
  return next;
}

const STORED_HIGHLIGHTS_FOR_OTHER_GAMES = 3;
const STORED_PERFORMERS_FOR_OTHER_GAMES = 2;

function slimPerformer(row: PlayerGameStats): PlayerGameStats {
  const { playerId, teamId, name, position, goals, assists, saves } = row;
  return { playerId, teamId, name, position, goals, assists, saves };
}

/**
 * The game as the save keeps it. Box scores are folded into season totals and dropped.
 * Games without the user's program keep a few highlights and top performers; the
 * user's games keep everything.
 */
export function storedGameResult(result: GameResult, keepDetail: boolean): GameResult {
  const rest: GameResult = { ...result };
  delete rest.boxScoreA;
  delete rest.boxScoreB;
  if (keepDetail) return rest;
  delete rest.scoringPlays;
  return {
    ...rest,
    highlights: rest.highlights.slice(0, STORED_HIGHLIGHTS_FOR_OTHER_GAMES),
    topPlayersA: rest.topPlayersA.slice(0, STORED_PERFORMERS_FOR_OTHER_GAMES).map(slimPerformer),
    topPlayersB: rest.topPlayersB.slice(0, STORED_PERFORMERS_FOR_OTHER_GAMES).map(slimPerformer),
  };
}

export const points = (line: PlayerSeasonLine) => line.goals + line.assists;
export const shotsFaced = (line: PlayerSeasonLine) => line.saves + line.goalsAllowed;
export const savePct = (line: PlayerSeasonLine) => (shotsFaced(line) > 0 ? line.saves / shotsFaced(line) : 0);
export const faceoffPct = (line: PlayerSeasonLine) => (line.faceoffsTaken > 0 ? line.faceoffWins / line.faceoffsTaken : 0);

/** Shots on goal a goalie must face, and draws a faceoff man must take, to lead in a rate. */
export const MIN_SHOTS_FACED = 120;
export const MIN_FACEOFFS = 120;

export interface LeaderCategory {
  key: string;
  label: string;
  /** How the leader's number reads in a table. */
  format: (line: PlayerSeasonLine) => string;
  value: (line: PlayerSeasonLine) => number;
  qualifies?: (line: PlayerSeasonLine) => boolean;
}

const pct = (value: number) => `.${Math.round(value * 1000).toString().padStart(3, '0')}`;

export const LEADER_CATEGORIES: LeaderCategory[] = [
  { key: 'points', label: 'Points', value: points, format: (line) => `${points(line)} (${line.goals} G, ${line.assists} A)` },
  { key: 'goals', label: 'Goals', value: (line) => line.goals, format: (line) => `${line.goals}` },
  { key: 'assists', label: 'Assists', value: (line) => line.assists, format: (line) => `${line.assists}` },
  { key: 'groundBalls', label: 'Ground balls', value: (line) => line.groundBalls, format: (line) => `${line.groundBalls}` },
  { key: 'causedTurnovers', label: 'Caused turnovers', value: (line) => line.causedTurnovers, format: (line) => `${line.causedTurnovers}` },
  {
    key: 'savePct',
    label: 'Save %',
    value: savePct,
    qualifies: (line) => line.position === 'G' && shotsFaced(line) >= MIN_SHOTS_FACED,
    format: (line) => `${pct(savePct(line))} (${line.saves} saves)`,
  },
  {
    key: 'faceoffPct',
    label: 'Faceoff %',
    value: faceoffPct,
    qualifies: (line) => line.faceoffsTaken >= MIN_FACEOFFS,
    format: (line) => `${pct(faceoffPct(line))} (${line.faceoffWins}–${line.faceoffsTaken - line.faceoffWins})`,
  },
];

/** The top `count` qualified players in a category, ties broken by name. */
export function seasonLeaders(stats: SeasonStats | null | undefined, category: LeaderCategory, count = 10): PlayerSeasonLine[] {
  return Object.values(stats ?? {})
    .filter((line) => (category.qualifies ? category.qualifies(line) : true))
    .sort((a, b) => category.value(b) - category.value(a) || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId))
    .slice(0, count);
}

function best(lines: PlayerSeasonLine[], score: (line: PlayerSeasonLine) => number): PlayerSeasonLine | null {
  let top: PlayerSeasonLine | null = null;
  for (const line of lines) {
    if (!top || score(line) > score(top) || (score(line) === score(top) && line.playerId < top.playerId)) top = line;
  }
  return top;
}

function award(name: string, line: PlayerSeasonLine | null, statLine: (line: PlayerSeasonLine) => string): SeasonAward[] {
  if (!line) return [];
  return [{ award: name, playerId: line.playerId, name: line.name, teamId: line.teamId, position: line.position, statLine: statLine(line) }];
}

/** The national awards for a finished regular season. */
export function seasonAwards(stats: SeasonStats | null | undefined): SeasonAward[] {
  const lines = Object.values(stats ?? {});
  const fieldPlayers = lines.filter((line) => line.position === 'A' || line.position === 'M');
  const goalies = lines.filter((line) => line.position === 'G' && shotsFaced(line) >= MIN_SHOTS_FACED);
  const faceoffMen = lines.filter((line) => line.faceoffsTaken >= MIN_FACEOFFS);
  const defenders = lines.filter((line) => line.position === 'D' || line.position === 'LSM');
  const freshmen = lines.filter((line) => line.year === 1);
  const impact = (line: PlayerSeasonLine) => points(line) + line.groundBalls * 0.3 + line.causedTurnovers * 0.6 + line.saves * 0.08;

  return [
    ...award('Player of the Year', best(fieldPlayers, (line) => points(line) + line.goals * 0.01), (line) => `${line.goals} G, ${line.assists} A`),
    ...award('Goalie of the Year', best(goalies, savePct), (line) => `${pct(savePct(line))} save %, ${line.saves} saves`),
    ...award('Defensive Player of the Year', best(defenders, (line) => line.causedTurnovers * 2 + line.groundBalls), (line) => `${line.causedTurnovers} CT, ${line.groundBalls} GB`),
    ...award('Faceoff Specialist of the Year', best(faceoffMen, faceoffPct), (line) => `${pct(faceoffPct(line))} on draws`),
    ...award('Freshman of the Year', best(freshmen, impact), (line) =>
      line.position === 'G' ? `${line.saves} saves` : `${line.goals} G, ${line.assists} A, ${line.groundBalls} GB`),
  ];
}

export interface AllAmericanTeams {
  first: SeasonAward[];
  second: SeasonAward[];
}

/** The lineup an All-American team fills: a starting ten plus the two specialists. */
const ALL_AMERICAN_SLOTS: Array<{ position: PlayerSeasonLine['position']; count: number; label: string }> = [
  { position: 'A', count: 3, label: 'Attack' },
  { position: 'M', count: 3, label: 'Midfield' },
  { position: 'D', count: 3, label: 'Defense' },
  { position: 'LSM', count: 1, label: 'Long-stick midfield' },
  { position: 'FO', count: 1, label: 'Faceoff' },
  { position: 'G', count: 1, label: 'Goalie' },
];

function allAmericanScore(line: PlayerSeasonLine): number {
  switch (line.position) {
    case 'A':
      return points(line) + line.groundBalls * 0.2;
    case 'M':
      return points(line) + line.groundBalls * 0.3 + line.causedTurnovers * 0.6;
    case 'D':
      return line.causedTurnovers * 2 + line.groundBalls;
    case 'LSM':
      return line.causedTurnovers * 2 + line.groundBalls + points(line) * 0.5;
    case 'FO':
      return line.faceoffsTaken >= MIN_FACEOFFS ? faceoffPct(line) * 1000 + line.groundBalls * 0.5 : -Infinity;
    case 'G':
      return shotsFaced(line) >= MIN_SHOTS_FACED ? savePct(line) * 1000 + line.saves * 0.1 : -Infinity;
    default:
      return 0;
  }
}

function allAmericanStatLine(line: PlayerSeasonLine): string {
  if (line.position === 'G') return `${pct(savePct(line))} save %, ${line.saves} saves`;
  if (line.position === 'FO') return `${pct(faceoffPct(line))} on draws, ${line.groundBalls} GB`;
  if (line.position === 'D' || line.position === 'LSM') return `${line.causedTurnovers} CT, ${line.groundBalls} GB`;
  return `${line.goals} G, ${line.assists} A`;
}

/** First and second All-American teams for a finished regular season. */
export function allAmericanTeams(stats: SeasonStats | null | undefined): AllAmericanTeams {
  const lines = Object.values(stats ?? {});
  const teams: AllAmericanTeams = { first: [], second: [] };
  for (const slot of ALL_AMERICAN_SLOTS) {
    const ranked = lines
      .filter((line) => line.position === slot.position && Number.isFinite(allAmericanScore(line)))
      .sort((a, b) => allAmericanScore(b) - allAmericanScore(a) || a.playerId.localeCompare(b.playerId));
    const pick = (line: PlayerSeasonLine): SeasonAward => ({
      award: slot.label,
      playerId: line.playerId,
      name: line.name,
      teamId: line.teamId,
      position: line.position,
      statLine: allAmericanStatLine(line),
    });
    teams.first.push(...ranked.slice(0, slot.count).map(pick));
    teams.second.push(...ranked.slice(slot.count, slot.count * 2).map(pick));
  }
  return teams;
}
