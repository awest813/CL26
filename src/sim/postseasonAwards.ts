import type { CoachOfTheYear, PlayerGameStats, PlayerSeasonLine, PlayoffState, PlayoffRoundName, SeasonAward, Team, TeamRecord } from '../types/sim.ts';
import { expectedWinsByTeamId } from './programLedger.ts';
import { points } from './seasonStats.ts';

/**
 * Awards handed out after the regular season: each conference's Player of the Year
 * when the regular season ends, then Coach of the Year and the championship's Most
 * Outstanding Player once the bracket is decided.
 */

const ROUND_BONUS: Record<PlayoffRoundName, number> = {
  ROUND1: 0.5,
  QUARTERFINAL: 1,
  SEMIFINAL: 1.75,
  FINAL: 2.5,
};
const CHAMPION_BONUS = 3.5;

/** The best field player in each conference, by points; ties go to goals, then id. */
export function conferencePlayersOfYear(
  stats: Record<string, PlayerSeasonLine> | null | undefined,
  teams: Team[],
): Record<string, SeasonAward> {
  const conferenceByTeamId = new Map(teams.map((team) => [team.id, team.conferenceId]));
  const best = new Map<string, PlayerSeasonLine>();
  for (const line of Object.values(stats ?? {})) {
    if (line.position === 'G') continue;
    const conferenceId = conferenceByTeamId.get(line.teamId);
    if (!conferenceId) continue;
    const top = best.get(conferenceId);
    const score = points(line) + line.goals * 0.01;
    const topScore = top ? points(top) + top.goals * 0.01 : -1;
    if (!top || score > topScore || (score === topScore && line.playerId < top.playerId)) best.set(conferenceId, line);
  }
  return Object.fromEntries([...best.entries()].map(([conferenceId, line]) => [
    conferenceId,
    {
      award: 'Conference Player of the Year',
      playerId: line.playerId,
      name: line.name,
      teamId: line.teamId,
      position: line.position,
      statLine: `${line.goals} G, ${line.assists} A`,
    },
  ]));
}

/** The deepest round each program reached, and whether it won it all. */
function bracketRuns(playoffs: PlayoffState | null | undefined): Map<string, { round: PlayoffRoundName; champion: boolean }> {
  const runs = new Map<string, { round: PlayoffRoundName; champion: boolean }>();
  if (!playoffs) return runs;
  (['ROUND1', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'] as PlayoffRoundName[]).forEach((round) => {
    playoffs.rounds[round].forEach((game) => {
      [game.homeTeamId, game.awayTeamId].forEach((teamId) => {
        if (teamId) runs.set(teamId, { round, champion: false });
      });
    });
  });
  if (playoffs.championTeamId) runs.set(playoffs.championTeamId, { round: 'FINAL', champion: true });
  return runs;
}

const RUN_LABEL: Record<PlayoffRoundName, string> = {
  ROUND1: 'made the field',
  QUARTERFINAL: 'reached the quarterfinals',
  SEMIFINAL: 'reached the semifinals',
  FINAL: 'reached the championship',
};

/**
 * Coach of the Year: the most wins over what the program's prestige said it would win,
 * plus credit for the bracket run. Teams are at their current prestige.
 */
export function coachOfTheYear(input: {
  teams: Team[];
  records: Record<string, TeamRecord>;
  playoffs: PlayoffState | null | undefined;
  coachNameByTeamId: (teamId: string) => string;
}): CoachOfTheYear | null {
  const expected = expectedWinsByTeamId(input.teams);
  const runs = bracketRuns(input.playoffs);
  let top: { teamId: string; score: number; overExpected: number } | null = null;
  for (const team of input.teams) {
    const record = input.records[team.id];
    if (!record) continue;
    const overExpected = record.wins - (expected.get(team.id) ?? 6);
    const run = runs.get(team.id);
    const score = overExpected + (run ? (run.champion ? CHAMPION_BONUS : ROUND_BONUS[run.round]) : 0);
    if (!top || score > top.score || (score === top.score && team.id < top.teamId)) {
      top = { teamId: team.id, score, overExpected };
    }
  }
  if (!top) return null;
  const record = input.records[top.teamId];
  const run = runs.get(top.teamId);
  const over = Math.round(top.overExpected * 10) / 10;
  const runText = run ? (run.champion ? 'won the national title' : RUN_LABEL[run.round]) : 'missed the field';
  return {
    teamId: top.teamId,
    coachName: input.coachNameByTeamId(top.teamId),
    record: `${record.wins}–${record.losses}`,
    detail: `${over >= 0 ? '+' : ''}${over} wins over expectation and ${runText}`,
  };
}

/**
 * The championship's Most Outstanding Player: the best line across the semifinals and the
 * final, with a nudge toward the champion's players.
 */
export function mostOutstandingPlayer(playoffs: PlayoffState | null | undefined): SeasonAward | null {
  if (!playoffs?.championTeamId) return null;
  const totals = new Map<string, PlayerGameStats>();
  [...playoffs.rounds.SEMIFINAL, ...playoffs.rounds.FINAL].forEach((game) => {
    (game.result?.topPerformers ?? []).forEach((line) => {
      const current = totals.get(line.playerId);
      totals.set(line.playerId, current
        ? { ...current, goals: current.goals + line.goals, assists: current.assists + line.assists, saves: current.saves + line.saves }
        : { ...line });
    });
  });
  const value = (line: PlayerGameStats) =>
    line.goals + line.assists * 0.8 + line.saves * 0.12 + (line.teamId === playoffs.championTeamId ? 1.5 : 0);
  let top: PlayerGameStats | null = null;
  for (const line of totals.values()) {
    if (!top || value(line) > value(top) || (value(line) === value(top) && line.playerId < top.playerId)) top = line;
  }
  if (!top) return null;
  const parts = [
    top.goals > 0 ? `${top.goals} G` : null,
    top.assists > 0 ? `${top.assists} A` : null,
    top.saves > 0 ? `${top.saves} saves` : null,
  ].filter(Boolean);
  return {
    award: 'Most Outstanding Player',
    playerId: top.playerId,
    name: top.name,
    teamId: top.teamId,
    position: top.position,
    statLine: `${parts.join(', ')} in the semifinal and final`,
  };
}
