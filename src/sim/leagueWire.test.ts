import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { GameResult, PlayerGameStats, ScheduledGame, TeamGameStats } from '../types/sim.ts';
import { buildLeagueWire } from './leagueWire.ts';

const stats = (teamId: string, goals: number): TeamGameStats => ({
  teamId,
  goals,
  shots: 30,
  saves: 10,
  turnovers: 12,
  groundBalls: 25,
  penalties: 3,
  faceoffPct: 50,
});

const line = (playerId: string, teamId: string, goals: number, assists = 0, saves = 0): PlayerGameStats => ({
  playerId,
  teamId,
  name: playerId.toUpperCase(),
  position: saves > 0 ? 'G' : 'A',
  goals,
  assists,
  saves,
});

function game(id: string, a: string, b: string, scoreA: number, scoreB: number, top: PlayerGameStats[] = []): GameResult {
  return {
    id,
    weekIndex: 3,
    seed: 1,
    teamAId: a,
    teamBId: b,
    teamAName: a,
    teamBName: b,
    scoreA,
    scoreB,
    statsA: stats(a, scoreA),
    statsB: stats(b, scoreB),
    topPlayersA: top.filter((row) => row.teamId === a),
    topPlayersB: top.filter((row) => row.teamId === b),
    highlights: [],
  };
}

const name = (id: string) => id.toUpperCase();

describe('league wire', () => {
  const results = [
    // Unranked x beats No. 3 y.
    game('g1', 'x', 'y', 11, 9, [line('p1', 'x', 4, 2)]),
    // No. 2 beats No. 9 in a ranked showdown.
    game('g2', 'r2', 'r9', 12, 10, [line('p2', 'r2', 6, 1)]),
    // A shootout and a rout among unranked teams.
    game('g3', 'm', 'n', 19, 16),
    game('g4', 'o', 'p', 18, 4),
    // The user's conference: c1 beats c2; the user's own game stays out.
    game('g5', 'c1', 'c2', 10, 8),
    game('g6', 'me', 'c3', 9, 7),
  ];
  const rankBefore = { r2: 2, y: 3, r9: 9, f: 10 };
  const rankAfter = { r2: 1, y: 8, r9: 11, x: 20 };
  const nextWeek: ScheduledGame[] = [
    { id: 'n1', weekIndex: 4, homeTeamId: 'r2', awayTeamId: 'x', conferenceGame: false },
    { id: 'n2', weekIndex: 4, homeTeamId: 'm', awayTeamId: 'n', conferenceGame: true },
    { id: 'n3', weekIndex: 4, homeTeamId: 'y', awayTeamId: 'q', conferenceGame: true, rivalryTrophy: 'The Cup' },
  ];
  const wire = buildLeagueWire({
    results,
    rankBefore,
    rankAfter,
    nextWeek,
    teamName: name,
    userTeamId: 'me',
    conferenceTeamIds: new Set(['me', 'c1', 'c2', 'c3']),
  });

  test('leads with the upset and keeps the ranked showdown', () => {
    assert.strictEqual(wire.headlines[0].kind, 'upset');
    assert.match(wire.headlines[0].headline, /X knocks off No. 3 Y/);
    assert.ok(wire.headlines.some((item) => item.kind === 'showdown' && item.headline.includes('No. 2 R2')));
  });

  test('names the player of the week, the shootout, and the rout', () => {
    const star = wire.headlines.find((item) => item.kind === 'star');
    assert.ok(star);
    assert.match(star.headline, /P2/);
    assert.ok(wire.headlines.some((item) => item.kind === 'shootout' && item.detail.startsWith('19–16')));
    assert.ok(wire.headlines.some((item) => item.kind === 'rout' && item.detail.startsWith('18–4')));
  });

  test('lists conference results without the user game', () => {
    assert.deepStrictEqual(wire.conferenceScores.map((score) => score.gameId), ['g5']);
  });

  test('reports poll movers and teams that dropped out', () => {
    assert.deepStrictEqual(wire.risers.map((mover) => mover.teamId), ['x']);
    assert.deepStrictEqual(wire.fallers.map((mover) => mover.teamId), ['y']);
    assert.deepStrictEqual(wire.droppedOut, ['f']);
  });

  test('previews ranked games and ranked rivalries next week', () => {
    assert.deepStrictEqual(wire.gamesToWatch.map((preview) => preview.gameId), ['n1', 'n3']);
  });

  test('an empty week has nothing to report', () => {
    const empty = buildLeagueWire({
      results: [],
      rankBefore: {},
      rankAfter: {},
      nextWeek: [],
      teamName: name,
      userTeamId: null,
      conferenceTeamIds: new Set(),
    });
    assert.deepStrictEqual(empty, { headlines: [], conferenceScores: [], risers: [], fallers: [], droppedOut: [], gamesToWatch: [] });
  });
});
