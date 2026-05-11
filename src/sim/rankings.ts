import { GameResult, RankingRow, RankingScoreBreakdown, Team, TeamRecord } from '../types/sim';

interface RankingInputRow {
  team: Team;
  record: TeamRecord;
}

function winPct(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? wins / total : 0;
}

export const RANKING_WEIGHTS = {
  overallWinPct: 1000,
  conferenceWinPct: 300,
  pointDifferential: 2,
  prestige: 0.8,
  scoringVolume: 0.15,
  strengthOfSchedule: 120,
} as const;

/**
 * Compute the average opponent win percentage (Strength of Schedule) for every team
 * that has played at least one game this season.
 */
export function computeAllSOS(
  gameResults: GameResult[],
  recordsByTeamId: Record<string, TeamRecord>,
): Record<string, number> {
  const opponentWinPcts: Record<string, number[]> = {};

  for (const result of gameResults) {
    const tA = result.teamAId;
    const tB = result.teamBId;
    if (!tA || !tB) continue;

    if (!opponentWinPcts[tA]) opponentWinPcts[tA] = [];
    if (!opponentWinPcts[tB]) opponentWinPcts[tB] = [];

    const recA = recordsByTeamId[tA];
    const recB = recordsByTeamId[tB];

    if (recB) opponentWinPcts[tA].push(winPct(recB.wins, recB.losses));
    if (recA) opponentWinPcts[tB].push(winPct(recA.wins, recA.losses));
  }

  const sosByTeamId: Record<string, number> = {};
  for (const [teamId, pcts] of Object.entries(opponentWinPcts)) {
    sosByTeamId[teamId] = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  }
  return sosByTeamId;
}

export function computeRankingBreakdown(team: Team, record: TeamRecord, sos = 0): RankingScoreBreakdown {
  const overallWinPctPoints = winPct(record.wins, record.losses) * RANKING_WEIGHTS.overallWinPct;
  const conferenceWinPctPoints = winPct(record.confWins, record.confLosses) * RANKING_WEIGHTS.conferenceWinPct;
  const pointDifferentialPoints =
    (record.pointsFor - record.pointsAgainst) * RANKING_WEIGHTS.pointDifferential;
  const prestigePoints = team.prestige * RANKING_WEIGHTS.prestige;
  const scoringVolumePoints = record.pointsFor * RANKING_WEIGHTS.scoringVolume;
  const strengthOfSchedulePoints = sos * RANKING_WEIGHTS.strengthOfSchedule;
  const totalPoints =
    overallWinPctPoints + conferenceWinPctPoints + pointDifferentialPoints + prestigePoints + scoringVolumePoints + strengthOfSchedulePoints;

  return {
    overallWinPctPoints,
    conferenceWinPctPoints,
    pointDifferentialPoints,
    prestigePoints,
    scoringVolumePoints,
    strengthOfSchedulePoints,
    totalPoints,
  };
}

function scoreTeam(row: RankingInputRow, sos: number): number {
  return computeRankingBreakdown(row.team, row.record, sos).totalPoints;
}

export function computeRankings(
  teams: Team[],
  recordsByTeamId: Record<string, TeamRecord>,
  topN = 25,
  sosByTeamId?: Record<string, number>,
): RankingRow[] {
  return teams
    .map((team) => {
      const record = recordsByTeamId[team.id] ?? { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
      const sos = sosByTeamId?.[team.id] ?? 0;
      return { team, record, score: scoreTeam({ team, record }, sos) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((row, index) => ({
      rank: index + 1,
      teamId: row.team.id,
      points: Math.round(row.score),
      record: `${row.record.wins}-${row.record.losses}`,
    }));
}

export function computePlayoffProjection(
  teams: Team[],
  recordsByTeamId: Record<string, TeamRecord>,
  sosByTeamId?: Record<string, number>,
) {
  return computeRankings(teams, recordsByTeamId, 12, sosByTeamId);
}
