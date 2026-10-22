import type { GameResult, PlayerGameStats, ScheduledGame } from '../types/sim.ts';

/**
 * The week around the league, as the Weekly Hub's wire reads it: upsets of ranked
 * teams, ranked showdowns, the week's best line, poll movers, the user's conference,
 * and next week's games to watch. Pure: built from stored results and poll snapshots.
 */

export type WireKind = 'upset' | 'showdown' | 'shootout' | 'rout' | 'star';

export interface WireHeadline {
  id: string;
  kind: WireKind;
  headline: string;
  detail: string;
  /** Programs in the story, for links and the user's highlight. */
  teamIds: string[];
}

export interface WireScore {
  gameId: string;
  winnerId: string;
  loserId: string;
  winnerScore: number;
  loserScore: number;
  /** Poll rank going into the week, when ranked. */
  winnerRank: number | null;
  loserRank: number | null;
}

export interface WireMover {
  teamId: string;
  rank: number;
  /** Places gained (positive) or lost; null for a team new to the poll. */
  delta: number | null;
}

export interface WirePreview {
  gameId: string;
  homeId: string;
  awayId: string;
  homeRank: number | null;
  awayRank: number | null;
  rivalryTrophy?: string;
  conferenceGame: boolean;
}

export interface LeagueWire {
  headlines: WireHeadline[];
  conferenceScores: WireScore[];
  risers: WireMover[];
  fallers: WireMover[];
  /** Teams that dropped out of the Top 25 this week. */
  droppedOut: string[];
  gamesToWatch: WirePreview[];
}

export interface LeagueWireInput {
  /** Results of the week just played. */
  results: GameResult[];
  /** Top 25 going into that week. */
  rankBefore: Record<string, number>;
  /** Top 25 after it. */
  rankAfter: Record<string, number>;
  /** Next week's schedule, empty once the regular season is done. */
  nextWeek: ScheduledGame[];
  teamName: (teamId: string) => string;
  userTeamId: string | null;
  /** Programs in the user's conference, the user included. */
  conferenceTeamIds: Set<string>;
  maxHeadlines?: number;
}

const rankLabel = (rank: number | null | undefined) => (rank != null ? `No. ${rank} ` : '');

function scoreOf(result: GameResult): WireScore {
  const aWon = result.scoreA > result.scoreB;
  return {
    gameId: result.id ?? `${result.teamAId}-${result.teamBId}`,
    winnerId: aWon ? result.teamAId : result.teamBId,
    loserId: aWon ? result.teamBId : result.teamAId,
    winnerScore: Math.max(result.scoreA, result.scoreB),
    loserScore: Math.min(result.scoreA, result.scoreB),
    winnerRank: null,
    loserRank: null,
  };
}

/** A single game line's weight for player of the week: goals, then assists, then saves for a goalie. */
function lineValue(line: PlayerGameStats): number {
  return line.goals + line.assists * 0.8 + line.saves * 0.12;
}

function statLine(line: PlayerGameStats): string {
  const parts: string[] = [];
  if (line.goals > 0) parts.push(`${line.goals} G`);
  if (line.assists > 0) parts.push(`${line.assists} A`);
  if (line.saves > 0) parts.push(`${line.saves} saves`);
  return parts.join(', ');
}

export function buildLeagueWire(input: LeagueWireInput): LeagueWire {
  const { rankBefore, rankAfter, teamName } = input;
  const scores = input.results
    .filter((result) => result.scoreA !== result.scoreB)
    .map((result) => {
      const score = scoreOf(result);
      return { result, score: { ...score, winnerRank: rankBefore[score.winnerId] ?? null, loserRank: rankBefore[score.loserId] ?? null } };
    });

  const headlines: WireHeadline[] = [];

  // Upsets: a ranked team beaten by an unranked one or one ranked well below it.
  scores
    .filter(({ score }) => score.loserRank != null && (score.winnerRank == null || score.winnerRank - score.loserRank >= 5))
    .sort((a, b) => (a.score.loserRank ?? 99) - (b.score.loserRank ?? 99))
    .forEach(({ score }) => {
      headlines.push({
        id: `upset:${score.gameId}`,
        kind: 'upset',
        headline: `Upset: ${rankLabel(score.winnerRank)}${teamName(score.winnerId)} knocks off No. ${score.loserRank} ${teamName(score.loserId)}`,
        detail: `${score.winnerScore}–${score.loserScore}`,
        teamIds: [score.winnerId, score.loserId],
      });
    });

  // Ranked showdowns that held to form.
  scores
    .filter(({ score }) => score.winnerRank != null && score.loserRank != null && score.winnerRank < score.loserRank)
    .sort((a, b) => (a.score.winnerRank ?? 99) + (a.score.loserRank ?? 99) - ((b.score.winnerRank ?? 99) + (b.score.loserRank ?? 99)))
    .forEach(({ score }) => {
      headlines.push({
        id: `showdown:${score.gameId}`,
        kind: 'showdown',
        headline: `No. ${score.winnerRank} ${teamName(score.winnerId)} holds off No. ${score.loserRank} ${teamName(score.loserId)}`,
        detail: `${score.winnerScore}–${score.loserScore}`,
        teamIds: [score.winnerId, score.loserId],
      });
    });

  // The week's extremes: the most goals, and the widest margin.
  const byTotal = [...scores].sort((a, b) =>
    b.score.winnerScore + b.score.loserScore - (a.score.winnerScore + a.score.loserScore) || a.score.gameId.localeCompare(b.score.gameId));
  const shootout = byTotal[0];
  if (shootout && shootout.score.winnerScore + shootout.score.loserScore >= 30) {
    headlines.push({
      id: `shootout:${shootout.score.gameId}`,
      kind: 'shootout',
      headline: `Shootout: ${teamName(shootout.score.winnerId)} outlasts ${teamName(shootout.score.loserId)}`,
      detail: `${shootout.score.winnerScore}–${shootout.score.loserScore}, the week's highest-scoring game`,
      teamIds: [shootout.score.winnerId, shootout.score.loserId],
    });
  }
  const byMargin = [...scores].sort((a, b) =>
    b.score.winnerScore - b.score.loserScore - (a.score.winnerScore - a.score.loserScore) || a.score.gameId.localeCompare(b.score.gameId));
  const rout = byMargin[0];
  if (rout && rout.score.winnerScore - rout.score.loserScore >= 9 && rout.score.gameId !== shootout?.score.gameId) {
    headlines.push({
      id: `rout:${rout.score.gameId}`,
      kind: 'rout',
      headline: `${rankLabel(rout.score.winnerRank)}${teamName(rout.score.winnerId)} routs ${teamName(rout.score.loserId)}`,
      detail: `${rout.score.winnerScore}–${rout.score.loserScore}, the week's widest margin`,
      teamIds: [rout.score.winnerId, rout.score.loserId],
    });
  }

  // The week's best single-game line, anywhere in the league.
  let best: { line: PlayerGameStats; opponentId: string; won: boolean } | null = null;
  for (const result of input.results) {
    const sides: Array<[PlayerGameStats[], string, boolean]> = [
      [result.topPlayersA, result.teamBId, result.scoreA > result.scoreB],
      [result.topPlayersB, result.teamAId, result.scoreB > result.scoreA],
    ];
    for (const [lines, opponentId, won] of sides) {
      for (const line of lines) {
        const value = lineValue(line);
        const bestValue = best ? lineValue(best.line) : -1;
        if (value > bestValue || (best && value === bestValue && line.playerId < best.line.playerId)) {
          best = { line, opponentId, won };
        }
      }
    }
  }
  if (best && lineValue(best.line) > 0) {
    headlines.push({
      id: `star:${best.line.playerId}`,
      kind: 'star',
      headline: `Player of the week: ${best.line.name} (${best.line.position}), ${teamName(best.line.teamId)}`,
      detail: `${statLine(best.line)} ${best.won ? 'in a win over' : 'in a loss to'} ${teamName(best.opponentId)}`,
      teamIds: [best.line.teamId],
    });
  }

  const maxHeadlines = input.maxHeadlines ?? 6;
  // Upsets lead (three at most), then the week's star, then showdowns and the extremes.
  const priority: Record<WireKind, number> = { upset: 0, star: 1, showdown: 2, shootout: 3, rout: 4 };
  const upsets = headlines.filter((item) => item.kind === 'upset').slice(0, 3);
  const rest = headlines.filter((item) => item.kind !== 'upset').sort((a, b) => priority[a.kind] - priority[b.kind]);
  const trimmed = [...upsets, ...rest].slice(0, maxHeadlines);

  const conferenceScores = scores
    .map(({ score }) => score)
    .filter((score) => input.conferenceTeamIds.has(score.winnerId) || input.conferenceTeamIds.has(score.loserId))
    .filter((score) => score.winnerId !== input.userTeamId && score.loserId !== input.userTeamId);

  const movers: WireMover[] = Object.entries(rankAfter).map(([teamId, rank]) => ({
    teamId,
    rank,
    delta: rankBefore[teamId] != null ? rankBefore[teamId] - rank : null,
  }));
  const risers = movers
    .filter((mover) => mover.delta == null || mover.delta >= 3)
    // A newcomer counts as climbing from 26th.
    .sort((a, b) => (b.delta ?? (26 - b.rank)) - (a.delta ?? (26 - a.rank)) || a.rank - b.rank)
    .slice(0, 4);
  const fallers = movers
    .filter((mover) => mover.delta != null && mover.delta <= -3)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0) || a.rank - b.rank)
    .slice(0, 4);
  const droppedOut = Object.keys(rankBefore)
    .filter((teamId) => rankAfter[teamId] == null)
    .sort((a, b) => rankBefore[a] - rankBefore[b]);

  const gamesToWatch = input.nextWeek
    .map((game) => ({
      gameId: game.id,
      homeId: game.homeTeamId,
      awayId: game.awayTeamId,
      homeRank: rankAfter[game.homeTeamId] ?? null,
      awayRank: rankAfter[game.awayTeamId] ?? null,
      rivalryTrophy: game.rivalryTrophy,
      conferenceGame: game.conferenceGame,
    }))
    .filter((game) => (game.homeRank != null && game.awayRank != null) || (game.rivalryTrophy && (game.homeRank != null || game.awayRank != null)))
    .sort((a, b) => (a.homeRank ?? 40) + (a.awayRank ?? 40) - ((b.homeRank ?? 40) + (b.awayRank ?? 40)) || a.gameId.localeCompare(b.gameId))
    .slice(0, 4);

  return { headlines: trimmed, conferenceScores, risers, fallers, droppedOut, gamesToWatch };
}
