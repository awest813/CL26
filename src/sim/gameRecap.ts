import type { GameSummary, TeamGameStats, TopPerformer } from '../types/sim.ts';

/**
 * Box-score formatters shared by the season and exhibition views.
 * Every field beyond the original stat set is optional so results saved before
 * those stats existed still render instead of showing `undefined`.
 */

/** Shots with shots-on-goal in parentheses: `35 (23)`. */
export function shotLine(stats: TeamGameStats): string {
  return stats.shotsOnGoal == null ? `${stats.shots}` : `${stats.shots} (${stats.shotsOnGoal})`;
}

/** Faceoffs won of faceoffs taken: `14/27`. Falls back to the stored percentage. */
export function faceoffLine(stats: TeamGameStats): string {
  if (stats.faceoffsWon == null || !stats.faceoffsTaken) return `${stats.faceoffPct}%`;
  return `${stats.faceoffsWon}/${stats.faceoffsTaken}`;
}

/** Successful clears of clears attempted: `16/18`. */
export function clearLine(stats: TeamGameStats): string {
  if (stats.clearsAttempted == null) return '—';
  return `${stats.clearsSuccessful ?? 0}/${stats.clearsAttempted}`;
}

/** Extra-man goals of man-up opportunities: `1/3`. */
export function manUpLine(stats: TeamGameStats): string {
  if (stats.manUpOpportunities == null) return '—';
  return `${stats.manUpGoals ?? 0}/${stats.manUpOpportunities}`;
}

/** Penalty count with time served: `3 (2:30)`. */
export function penaltyLine(stats: TeamGameStats): string {
  if (stats.penaltyMinutes == null) return `${stats.penalties}`;
  const totalSeconds = Math.round(stats.penaltyMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${stats.penalties} (${minutes}:${seconds})`;
}

export interface GameRecap {
  gameId: string;
  summary: string;
  keyEdge: string;
  mvp: TopPerformer | null;
  efficiencyNote: string;
}

function formatPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

/** Goalie save percentage in the usual `.512` form; empty when nothing was faced. */
function formatSavePct(saves: number, goalsAllowed: number): string {
  const shotsFaced = saves + goalsAllowed;
  if (shotsFaced <= 0) return '';
  return (saves / shotsFaced).toFixed(3).replace(/^0/, '');
}

export function buildGameRecap(game: GameSummary, awayName: string, homeName: string): GameRecap {
  const homeWon = game.homeScore > game.awayScore;
  const awayWon = game.awayScore > game.homeScore;
  const winnerName = homeWon ? homeName : awayWon ? awayName : homeName;
  const loserName = homeWon ? awayName : awayWon ? homeName : awayName;
  const margin = Math.abs(game.homeScore - game.awayScore);

  const awayShooting = formatPct(game.teamStatsAway.goals, game.teamStatsAway.shots);
  const homeShooting = formatPct(game.teamStatsHome.goals, game.teamStatsHome.shots);
  // Save percentage is saves over shots faced on goal — the keeper's own line.
  const awaySavePct = formatSavePct(game.teamStatsAway.saves, game.teamStatsHome.goals);
  const homeSavePct = formatSavePct(game.teamStatsHome.saves, game.teamStatsAway.goals);

  const foEdge = game.teamStatsHome.faceoffPct - game.teamStatsAway.faceoffPct;
  const gbEdge = game.teamStatsHome.groundBalls - game.teamStatsAway.groundBalls;
  const toEdge = game.teamStatsAway.turnovers - game.teamStatsHome.turnovers;

  // Clearing and extra-man are the two possession battles a lacrosse coach reads first,
  // so they outrank the generic ground-ball / turnover lines when they were decisive.
  const homeClears = game.teamStatsHome.clearsAttempted ?? 0;
  const awayClears = game.teamStatsAway.clearsAttempted ?? 0;
  const homeClearPct = homeClears > 0 ? (game.teamStatsHome.clearsSuccessful ?? 0) / homeClears : null;
  const awayClearPct = awayClears > 0 ? (game.teamStatsAway.clearsSuccessful ?? 0) / awayClears : null;
  const homeManUp = game.teamStatsHome.manUpGoals ?? 0;
  const awayManUp = game.teamStatsAway.manUpGoals ?? 0;

  let keyEdge = `${winnerName} controlled the details.`;
  if (
    homeClearPct != null &&
    awayClearPct != null &&
    Math.abs(homeClearPct - awayClearPct) >= 0.2
  ) {
    const isHome = homeClearPct > awayClearPct;
    const team = isHome ? homeName : awayName;
    const beaten = isHome ? awayName : homeName;
    const rideStats = isHome
      ? `${game.teamStatsAway.clearsSuccessful ?? 0}/${awayClears}`
      : `${game.teamStatsHome.clearsSuccessful ?? 0}/${homeClears}`;
    keyEdge = `${team}'s ride broke ${beaten} down (${rideStats} clearing).`;
  } else if (Math.abs(homeManUp - awayManUp) >= 2) {
    const isHome = homeManUp > awayManUp;
    const team = isHome ? homeName : awayName;
    const stats = isHome
      ? `${homeManUp}/${game.teamStatsHome.manUpOpportunities ?? 0}`
      : `${awayManUp}/${game.teamStatsAway.manUpOpportunities ?? 0}`;
    keyEdge = `${team} cashed in with the extra man (${stats} man-up).`;
  } else if (Math.abs(foEdge) >= 8) {
    const isHome = foEdge > 0;
    const team = isHome ? homeName : awayName;
    const stats = isHome
      ? `${game.teamStatsHome.faceoffPct}-${game.teamStatsAway.faceoffPct}`
      : `${game.teamStatsAway.faceoffPct}-${game.teamStatsHome.faceoffPct}`;
    keyEdge = `${team} dominated faceoffs (${stats}).`;
  } else if (Math.abs(gbEdge) >= 4) {
    const isHome = gbEdge > 0;
    const team = isHome ? homeName : awayName;
    const stats = isHome
      ? `${game.teamStatsHome.groundBalls}-${game.teamStatsAway.groundBalls}`
      : `${game.teamStatsAway.groundBalls}-${game.teamStatsHome.groundBalls}`;
    keyEdge = `${team} won the ground-ball battle (${stats}).`;
  } else if (Math.abs(toEdge) >= 3) {
    const isHomeWinner = toEdge > 0;
    const team = isHomeWinner ? homeName : awayName;
    const stats = isHomeWinner
      ? `${game.teamStatsHome.turnovers}-${game.teamStatsAway.turnovers}`
      : `${game.teamStatsAway.turnovers}-${game.teamStatsHome.turnovers}`;
    keyEdge = `${team} protected possession with fewer turnovers (${stats}).`;
  }

  const mvp =
    [...(game.topPerformers ?? [])].sort((a, b) => b.goals + b.assists * 0.7 + b.saves * 0.15 - (a.goals + a.assists * 0.7 + a.saves * 0.15))[0] ??
    null;

  return {
    gameId: game.id,
    summary: margin === 0
      ? `${homeName} and ${awayName} finished level (${game.awayScore}-${game.homeScore}).`
      : `${winnerName} beat ${loserName} by ${margin} (${game.awayScore}-${game.homeScore}).`,
    keyEdge,
    mvp,
    efficiencyNote:
      `${awayName} shot ${awayShooting}% · ${homeName} shot ${homeShooting}%` +
      (awaySavePct && homeSavePct ? ` · saves ${awaySavePct}/${homeSavePct}` : ''),
  };
}

/** Adapt a persisted GameResult into the compact GameSummary shape used by recaps. */
export function gameResultToSummary(result: {
  id?: string;
  weekIndex?: number;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  statsA: GameSummary['teamStatsHome'];
  statsB: GameSummary['teamStatsAway'];
  topPlayersA: NonNullable<GameSummary['topPerformers']>;
  topPlayersB: NonNullable<GameSummary['topPerformers']>;
}): GameSummary {
  return {
    id: result.id ?? `${result.teamAId}-${result.teamBId}`,
    weekIndex: result.weekIndex ?? 0,
    homeTeamId: result.teamAId,
    awayTeamId: result.teamBId,
    homeScore: result.scoreA,
    awayScore: result.scoreB,
    teamStatsHome: result.statsA,
    teamStatsAway: result.statsB,
    topPerformers: [...result.topPlayersA, ...result.topPlayersB],
  };
}
