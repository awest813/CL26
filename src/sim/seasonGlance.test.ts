import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { GameResult, ScheduledGame, TeamGameStats } from '../types/sim.ts';
import { buildSeasonGlance } from './seasonGlance.ts';

const stats = (teamId: string, goals: number): TeamGameStats => ({
  teamId, goals, shots: 30, saves: 10, turnovers: 10, groundBalls: 20, penalties: 2, faceoffPct: 50,
});
const game = (week: number, home: string, away: string, conference = false, rivalryTrophy?: string): ScheduledGame => ({
  id: `g${week}`, weekIndex: week, homeTeamId: home, awayTeamId: away, conferenceGame: conference, ...(rivalryTrophy ? { rivalryTrophy } : {}),
});
const result = (week: number, a: string, b: string, scoreA: number, scoreB: number): GameResult => ({
  id: `g${week}`, weekIndex: week, seed: 1, teamAId: a, teamBId: b, teamAName: a, teamBName: b, scoreA, scoreB,
  statsA: stats(a, scoreA), statsB: stats(b, scoreB), topPlayersA: [], topPlayersB: [], highlights: [],
});

describe('season glance', () => {
  const schedule = [
    [game(0, 'me', 'a', true), game(0, 'x', 'y')],
    [game(1, 'b', 'me')],
    [game(2, 'me', 'c', true)],
    [game(3, 'd', 'me', true, 'The Cup')],
    [game(4, 'me', 'e')],
    [game(5, 'f', 'me')],
  ];
  const results = [
    result(0, 'me', 'a', 10, 8),
    result(1, 'b', 'me', 12, 9),
    result(2, 'me', 'c', 14, 7),
    result(3, 'd', 'me', 6, 11),
  ];
  const glance = buildSeasonGlance({
    scheduleByWeek: schedule,
    results,
    userTeamId: 'me',
    records: { e: { wins: 3, losses: 1, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 } },
    rankByTeamId: { e: 7 },
    upcomingCount: 1,
  });

  test('reads every played game from the user side, home or away', () => {
    assert.deepEqual(glance.played.map((row) => row.result), [
      { won: true, userScore: 10, opponentScore: 8 },
      { won: false, userScore: 9, opponentScore: 12 },
      { won: true, userScore: 14, opponentScore: 7 },
      { won: true, userScore: 11, opponentScore: 6 },
    ]);
    assert.equal(glance.played[3].rivalryTrophy, 'The Cup');
  });

  test('shows the next games with the opponent rank and record', () => {
    assert.equal(glance.upcoming.length, 1);
    assert.deepEqual(
      { id: glance.upcoming[0].opponentId, rank: glance.upcoming[0].opponentRank, record: glance.upcoming[0].opponentRecord, home: glance.upcoming[0].home },
      { id: 'e', rank: 7, record: '3–1', home: true },
    );
  });

  test('tracks the streak and the home, road, and conference splits', () => {
    assert.equal(glance.streak, 'W2');
    assert.equal(glance.home, '2–0');
    assert.equal(glance.road, '1–1');
    assert.equal(glance.conference, '3–0');
  });

  test('an unplayed season has no streak', () => {
    const empty = buildSeasonGlance({ scheduleByWeek: schedule, results: [], userTeamId: 'me', records: {}, rankByTeamId: {} });
    assert.equal(empty.streak, '');
    assert.equal(empty.upcoming.length, 3);
    assert.equal(empty.home, '0–0');
  });
});
