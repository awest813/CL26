import type { GameResult, ScheduledGame, TeamRecord } from '../types/sim.ts';

/**
 * The user's regular season at a glance, for the Weekly Hub: every game played with its
 * result, the next few on the schedule, the current streak, and home, road, and
 * conference splits.
 */

export interface GlanceGame {
  gameId: string;
  weekIndex: number;
  opponentId: string;
  home: boolean;
  conference: boolean;
  rivalryTrophy?: string;
  /** Missing until the game is played. */
  result?: { won: boolean; userScore: number; opponentScore: number };
  /** The opponent's poll rank and record now. */
  opponentRank: number | null;
  opponentRecord: string;
}

export interface SeasonGlance {
  played: GlanceGame[];
  upcoming: GlanceGame[];
  /** "W3", "L1", or "" before the first game. */
  streak: string;
  home: string;
  road: string;
  conference: string;
}

export function buildSeasonGlance(input: {
  scheduleByWeek: ScheduledGame[][];
  results: GameResult[];
  userTeamId: string;
  records: Record<string, TeamRecord>;
  rankByTeamId: Record<string, number>;
  /** How many unplayed games to show. */
  upcomingCount?: number;
}): SeasonGlance {
  const resultById = new Map(input.results.map((result) => [result.id, result]));
  const games: GlanceGame[] = [];
  input.scheduleByWeek.forEach((week) => {
    const game = week.find((row) => row.homeTeamId === input.userTeamId || row.awayTeamId === input.userTeamId);
    if (!game) return;
    const home = game.homeTeamId === input.userTeamId;
    const opponentId = home ? game.awayTeamId : game.homeTeamId;
    const record = input.records[opponentId];
    const stored = resultById.get(game.id);
    let result: GlanceGame['result'];
    if (stored) {
      const userIsA = stored.teamAId === input.userTeamId;
      const userScore = userIsA ? stored.scoreA : stored.scoreB;
      const opponentScore = userIsA ? stored.scoreB : stored.scoreA;
      result = { won: userScore > opponentScore, userScore, opponentScore };
    }
    games.push({
      gameId: game.id,
      weekIndex: game.weekIndex,
      opponentId,
      home,
      conference: game.conferenceGame,
      ...(game.rivalryTrophy ? { rivalryTrophy: game.rivalryTrophy } : {}),
      ...(result ? { result } : {}),
      opponentRank: input.rankByTeamId[opponentId] ?? null,
      opponentRecord: record ? `${record.wins}–${record.losses}` : '0–0',
    });
  });

  const played = games.filter((game) => game.result);
  const upcoming = games.filter((game) => !game.result).slice(0, input.upcomingCount ?? 3);

  let streak = '';
  if (played.length > 0) {
    const last = played[played.length - 1].result!.won;
    let count = 0;
    for (let i = played.length - 1; i >= 0 && played[i].result!.won === last; i -= 1) count += 1;
    streak = `${last ? 'W' : 'L'}${count}`;
  }
  const split = (rows: GlanceGame[]) => {
    const wins = rows.filter((game) => game.result!.won).length;
    return `${wins}–${rows.length - wins}`;
  };

  return {
    played,
    upcoming,
    streak,
    home: split(played.filter((game) => game.home)),
    road: split(played.filter((game) => !game.home)),
    conference: split(played.filter((game) => game.conference)),
  };
}
