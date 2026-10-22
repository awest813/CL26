import { GameResult, RankingRow, RankingScoreBreakdown, Team, TeamRecord } from '../types/sim';

function winPct(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? wins / total : 0;
}

export const RANKING_WEIGHTS = {
  overallWinPct: 1000,
  conferenceWinPct: 300,
  /** Per goal of margin, with each game's margin capped at MARGIN_CAP_PER_GAME. */
  pointDifferential: 3,
  prestige: 0.8,
  /** Applied to the RPI-style schedule strength, which runs about 0.35–0.65. */
  strengthOfSchedule: 400,
  /** Already in points: the sum of quality-win bonuses and bad-loss penalties. */
  qualityResults: 1,
} as const;

/** A blowout counts the same as a five-goal win, so running up the score does not buy poll position. */
export const MARGIN_CAP_PER_GAME = 5;

/** Opponent win percentage that makes a win a quality win, and the bonuses for each tier. */
export const QUALITY_WIN_TIERS = [
  { minOpponentWinPct: 0.667, points: 40, label: 'Win over a .667+ team' },
  { minOpponentWinPct: 0.5, points: 15, label: 'Win over a .500+ team' },
] as const;
/** A loss to a team under this win percentage is a bad loss. */
export const BAD_LOSS_MAX_OPPONENT_WIN_PCT = 0.333;
export const BAD_LOSS_PENALTY = 40;

/** Games after which program prestige no longer counts in the poll. Brand carries the preseason, results carry the rest. */
export const PRESTIGE_FADE_GAMES = 10;

/** Share of the prestige weight a team still gets after this many games: 1 in the preseason, 0 from game 10 on. */
export function prestigeWeightShare(gamesPlayed: number): number {
  return Math.max(0, 1 - gamesPlayed / PRESTIGE_FADE_GAMES);
}

/**
 * Compute the average opponent win percentage (Strength of Schedule) for every team
 * that has played at least one game this season.
 */
export function computeAllSOS(
  gameResults: GameResult[],
  recordsByTeamId: Record<string, TeamRecord>,
): Record<string, number> {
  const opponentWinPctsByTeamId: Record<string, number[]> = {};

  for (const result of gameResults) {
    const tA = result.teamAId;
    const tB = result.teamBId;
    if (!tA || !tB) continue;

    if (!opponentWinPctsByTeamId[tA]) opponentWinPctsByTeamId[tA] = [];
    if (!opponentWinPctsByTeamId[tB]) opponentWinPctsByTeamId[tB] = [];

    const recA = recordsByTeamId[tA];
    const recB = recordsByTeamId[tB];

    if (recB) opponentWinPctsByTeamId[tA].push(winPct(recB.wins, recB.losses));
    if (recA) opponentWinPctsByTeamId[tB].push(winPct(recA.wins, recA.losses));
  }

  const sosByTeamId: Record<string, number> = {};
  for (const [teamId, pcts] of Object.entries(opponentWinPctsByTeamId)) {
    sosByTeamId[teamId] = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  }
  return sosByTeamId;
}

/** Everything the poll reads from the games themselves, per team. */
export interface TeamPollInputs {
  /** RPI-style: two parts opponents' win %, one part their opponents' win %. */
  sos: number;
  /** Goal margin with each game capped at MARGIN_CAP_PER_GAME either way. */
  cappedMargin: number;
  /** Quality-win bonuses minus bad-loss penalties, in poll points. */
  qualityResults: number;
  qualityWins: number;
  badLosses: number;
}

export type PollInputs = Record<string, TeamPollInputs>;

const EMPTY_POLL_INPUTS: TeamPollInputs = { sos: 0, cappedMargin: 0, qualityResults: 0, qualityWins: 0, badLosses: 0 };

export function teamPollInputs(inputs: PollInputs | undefined, teamId: string): TeamPollInputs {
  return inputs?.[teamId] ?? EMPTY_POLL_INPUTS;
}

/** Points for a win over an opponent with this win percentage: the best tier it reaches, or zero. */
export function qualityWinPoints(opponentWinPct: number): number {
  return QUALITY_WIN_TIERS.find((tier) => opponentWinPct >= tier.minOpponentWinPct)?.points ?? 0;
}

/** Strength of schedule, capped margins, and quality wins for every team that has played. */
export function computePollInputs(
  gameResults: GameResult[],
  recordsByTeamId: Record<string, TeamRecord>,
): PollInputs {
  const owp = computeAllSOS(gameResults, recordsByTeamId);
  const opponentsByTeamId: Record<string, string[]> = {};
  const inputs: PollInputs = {};
  const entry = (teamId: string) => (inputs[teamId] ??= { ...EMPTY_POLL_INPUTS });
  const recordPct = (teamId: string) => {
    const record = recordsByTeamId[teamId];
    return record ? winPct(record.wins, record.losses) : 0;
  };

  for (const result of gameResults) {
    const { teamAId: a, teamBId: b } = result;
    if (!a || !b) continue;
    (opponentsByTeamId[a] ??= []).push(b);
    (opponentsByTeamId[b] ??= []).push(a);

    const margin = Math.max(-MARGIN_CAP_PER_GAME, Math.min(MARGIN_CAP_PER_GAME, result.scoreA - result.scoreB));
    entry(a).cappedMargin += margin;
    entry(b).cappedMargin -= margin;

    if (result.scoreA === result.scoreB) continue;
    const [winner, loser] = result.scoreA > result.scoreB ? [a, b] : [b, a];
    const bonus = qualityWinPoints(recordPct(loser));
    if (bonus > 0) {
      entry(winner).qualityResults += bonus;
      entry(winner).qualityWins += 1;
    }
    if (recordPct(winner) < BAD_LOSS_MAX_OPPONENT_WIN_PCT) {
      entry(loser).qualityResults -= BAD_LOSS_PENALTY;
      entry(loser).badLosses += 1;
    }
  }

  for (const [teamId, opponents] of Object.entries(opponentsByTeamId)) {
    const oowp = opponents.reduce((sum, opponent) => sum + (owp[opponent] ?? 0), 0) / opponents.length;
    entry(teamId).sos = (2 * (owp[teamId] ?? 0) + oowp) / 3;
  }
  return inputs;
}

export function computeRankingBreakdown(team: Team, record: TeamRecord, inputs: TeamPollInputs = EMPTY_POLL_INPUTS): RankingScoreBreakdown {
  const overallWinPctPoints = winPct(record.wins, record.losses) * RANKING_WEIGHTS.overallWinPct;
  const conferenceWinPctPoints = winPct(record.confWins, record.confLosses) * RANKING_WEIGHTS.conferenceWinPct;
  const pointDifferentialPoints = inputs.cappedMargin * RANKING_WEIGHTS.pointDifferential;
  const prestigePoints = team.prestige * RANKING_WEIGHTS.prestige * prestigeWeightShare(record.wins + record.losses);
  const strengthOfSchedulePoints = inputs.sos * RANKING_WEIGHTS.strengthOfSchedule;
  const qualityResultPoints = inputs.qualityResults * RANKING_WEIGHTS.qualityResults;
  const totalPoints =
    overallWinPctPoints + conferenceWinPctPoints + pointDifferentialPoints + prestigePoints + strengthOfSchedulePoints + qualityResultPoints;

  return {
    overallWinPctPoints,
    conferenceWinPctPoints,
    pointDifferentialPoints,
    prestigePoints,
    strengthOfSchedulePoints,
    qualityResultPoints,
    totalPoints,
  };
}

function pointDifferential(record: TeamRecord): number {
  return record.pointsFor - record.pointsAgainst;
}

export function computeRankings(
  teams: Team[],
  recordsByTeamId: Record<string, TeamRecord>,
  topN = 25,
  inputs?: PollInputs,
): RankingRow[] {
  return teams
    .map((team) => {
      const record = recordsByTeamId[team.id] ?? { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
      return { team, record, score: computeRankingBreakdown(team, record, teamPollInputs(inputs, team.id)).totalPoints };
    })
    .sort((a, b) => {
      const roundedScoreDiff = Math.round(b.score - a.score);
      if (roundedScoreDiff !== 0) return roundedScoreDiff;
      if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
      const pointDiff = pointDifferential(b.record) - pointDifferential(a.record);
      if (pointDiff !== 0) return pointDiff;
      if (b.team.prestige !== a.team.prestige) return b.team.prestige - a.team.prestige;
      const nameCompare = a.team.schoolName.localeCompare(b.team.schoolName);
      if (nameCompare !== 0) return nameCompare;
      return a.team.id.localeCompare(b.team.id);
    })
    .slice(0, topN)
    .map((row, index) => ({
      rank: index + 1,
      teamId: row.team.id,
      points: Math.round(row.score),
      record: `${row.record.wins}-${row.record.losses}`,
    }));
}
