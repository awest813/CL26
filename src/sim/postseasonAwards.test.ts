import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { PlayerSeasonLine, PlayoffGame, PlayoffState, Team, TeamRecord } from '../types/sim.ts';
import { coachOfTheYear, conferencePlayersOfYear, mostOutstandingPlayer } from './postseasonAwards.ts';

const team = (id: string, conferenceId: string, prestige: number): Team => ({
  id, schoolName: id.toUpperCase(), nickname: 'X', conferenceId, region: 'North', prestige,
});

const line = (playerId: string, teamId: string, goals: number, assists: number, position: PlayerSeasonLine['position'] = 'A'): PlayerSeasonLine => ({
  playerId, name: playerId, teamId, position, year: 3, goals, assists, shots: 0, groundBalls: 0, causedTurnovers: 0,
  saves: 0, goalsAllowed: 0, faceoffWins: 0, faceoffsTaken: 0,
});

const record = (wins: number, losses: number): TeamRecord => ({ wins, losses, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 });

function game(id: string, round: PlayoffGame['round'], home: string, away: string, winner: string, top: PlayoffGame['result'] extends infer R ? NonNullable<R>['topPerformers'] : never): PlayoffGame {
  return {
    id, round, slot: 0, homeSeed: 1, awaySeed: 2, homeTeamId: home, awayTeamId: away, winnerTeamId: winner,
    result: {
      id, weekIndex: -1, homeTeamId: home, awayTeamId: away, homeScore: 10, awayScore: 8,
      teamStatsHome: { teamId: home, goals: 10, shots: 30, saves: 8, turnovers: 10, groundBalls: 20, penalties: 2, faceoffPct: 50 },
      teamStatsAway: { teamId: away, goals: 8, shots: 30, saves: 8, turnovers: 10, groundBalls: 20, penalties: 2, faceoffPct: 50 },
      topPerformers: top,
    },
  };
}

describe('postseason awards', () => {
  const teams = [team('a', 'c1', 90), team('b', 'c1', 60), team('c', 'c2', 50), team('d', 'c2', 80)];

  test('each conference names its top field player, never a goalie', () => {
    const awards = conferencePlayersOfYear({
      p1: line('p1', 'a', 30, 20),
      p2: line('p2', 'b', 40, 15),
      p3: line('p3', 'c', 20, 10),
      g1: line('g1', 'd', 60, 0, 'G'),
    }, teams);
    assert.strictEqual(awards.c1.playerId, 'p2');
    assert.strictEqual(awards.c2.playerId, 'p3');
  });

  test('coach of the year rewards wins over expectation and the bracket run', () => {
    const records = { a: record(10, 2), b: record(9, 3), c: record(4, 8), d: record(6, 6) };
    const playoffs: PlayoffState = {
      seeds: [], currentRound: 'FINAL', championTeamId: 'a',
      rounds: { ROUND1: [], QUARTERFINAL: [], SEMIFINAL: [], FINAL: [game('f', 'FINAL', 'a', 'b', 'a', [])] },
    };
    const winner = coachOfTheYear({ teams, records, playoffs, coachNameByTeamId: (id) => `Coach ${id}` });
    // b was the third program by prestige, won 9 and reached the final.
    assert.strictEqual(winner?.teamId, 'b');
    assert.strictEqual(winner?.coachName, 'Coach b');
    assert.match(winner?.detail ?? '', /reached the championship/);
  });

  test('the most outstanding player comes from the semifinals and final', () => {
    const top = (playerId: string, teamId: string, goals: number) => ({ playerId, teamId, name: playerId, position: 'A' as const, goals, assists: 0, saves: 0 });
    const playoffs: PlayoffState = {
      seeds: [], currentRound: 'FINAL', championTeamId: 'a',
      rounds: {
        ROUND1: [], QUARTERFINAL: [],
        SEMIFINAL: [game('s1', 'SEMIFINAL', 'a', 'c', 'a', [top('x', 'a', 3)]), game('s2', 'SEMIFINAL', 'b', 'd', 'b', [top('y', 'b', 5)])],
        FINAL: [game('f', 'FINAL', 'a', 'b', 'a', [top('x', 'a', 3), top('y', 'b', 1)])],
      },
    };
    const mop = mostOutstandingPlayer(playoffs);
    assert.strictEqual(mop?.playerId, 'x');
    assert.match(mop?.statLine ?? '', /6 G/);
    assert.strictEqual(mostOutstandingPlayer({ ...playoffs, championTeamId: null }), null);
  });
});
