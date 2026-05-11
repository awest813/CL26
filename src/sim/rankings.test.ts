import { describe, expect, test } from 'bun:test';
import { computeAllSOS, computeRankingBreakdown, computeRankings, RANKING_WEIGHTS } from './rankings';
import type { GameResult, Team, TeamRecord } from '../types/sim';

function makeTeam(id: string, prestige = 70): Team {
  return { id, schoolName: `School ${id}`, nickname: 'Team', conferenceId: 'conf-1', region: 'Northeast', prestige };
}

function makeRecord(wins: number, losses: number, pointsFor = 0, pointsAgainst = 0): TeamRecord {
  return { wins, losses, confWins: wins, confLosses: losses, pointsFor, pointsAgainst };
}

function makeGameResult(teamAId: string, teamBId: string, scoreA: number, scoreB: number): GameResult {
  const blankStats = { teamId: teamAId, goals: 0, shots: 0, saves: 0, turnovers: 0, groundBalls: 0, penalties: 0, faceoffPct: 50 };
  return {
    id: `${teamAId}-vs-${teamBId}`,
    seed: 1,
    teamAId,
    teamBId,
    teamAName: `School ${teamAId}`,
    teamBName: `School ${teamBId}`,
    scoreA,
    scoreB,
    statsA: blankStats,
    statsB: { ...blankStats, teamId: teamBId },
    topPlayersA: [],
    topPlayersB: [],
    highlights: [],
  };
}

describe('computeAllSOS', () => {
  test('returns empty object when no games have been played', () => {
    const records = { 'a': makeRecord(0, 0), 'b': makeRecord(0, 0) };
    const result = computeAllSOS([], records);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('computes opponent average win% correctly', () => {
    // Team A beat Team B (1-0), Team A beat Team C (1-0)
    // Team B: 0-1 (0%), Team C: 0-1 (0%)
    // => A's SOS = avg(0%, 0%) = 0
    // Team B: played only A who is 2-0 (100%) => B's SOS = 1.0
    // Team C: played only A who is 2-0 (100%) => C's SOS = 1.0
    const results = [
      makeGameResult('a', 'b', 10, 5),
      makeGameResult('a', 'c', 8, 3),
    ];
    const records = {
      'a': makeRecord(2, 0),
      'b': makeRecord(0, 1),
      'c': makeRecord(0, 1),
    };
    const sos = computeAllSOS(results, records);
    expect(sos['a']).toBe(0); // opponents b and c both 0-1
    expect(sos['b']).toBe(1.0); // only played a who is 2-0
    expect(sos['c']).toBe(1.0); // only played a who is 2-0
  });

  test('averages correctly across multiple opponents', () => {
    // D played E (E is 1-0) and F (F is 0-1)
    // D's SOS should be avg(1.0, 0.0) = 0.5
    const results = [
      makeGameResult('d', 'e', 5, 10), // d loses to e
      makeGameResult('d', 'f', 10, 5), // d beats f
    ];
    const records = {
      'd': makeRecord(1, 1),
      'e': makeRecord(1, 0),
      'f': makeRecord(0, 1),
    };
    const sos = computeAllSOS(results, records);
    expect(sos['d']).toBeCloseTo(0.5, 5);
  });

  test('teams not in any game have no SOS entry', () => {
    const results = [makeGameResult('x', 'y', 8, 4)];
    const records = {
      'x': makeRecord(1, 0),
      'y': makeRecord(0, 1),
      'z': makeRecord(0, 0), // z never played
    };
    const sos = computeAllSOS(results, records);
    expect(sos['z']).toBeUndefined();
  });
});

describe('computeRankingBreakdown', () => {
  test('includes strengthOfSchedulePoints in total', () => {
    const team = makeTeam('t1', 80);
    const record = makeRecord(5, 0, 60, 30);
    const sos = 0.6; // 60% avg opp win rate

    const breakdown = computeRankingBreakdown(team, record, sos);
    const expectedSosPoints = sos * RANKING_WEIGHTS.strengthOfSchedule;
    expect(breakdown.strengthOfSchedulePoints).toBeCloseTo(expectedSosPoints, 5);
    expect(breakdown.totalPoints).toBeCloseTo(
      breakdown.overallWinPctPoints +
        breakdown.conferenceWinPctPoints +
        breakdown.pointDifferentialPoints +
        breakdown.prestigePoints +
        breakdown.scoringVolumePoints +
        breakdown.strengthOfSchedulePoints,
      5,
    );
  });

  test('SOS of 0 has no effect on ranking', () => {
    const team = makeTeam('t2', 75);
    const record = makeRecord(3, 3, 40, 40);
    const withSos = computeRankingBreakdown(team, record, 0);
    const withoutSos = computeRankingBreakdown(team, record);
    expect(withSos.totalPoints).toBe(withoutSos.totalPoints);
  });
});

describe('computeRankings with SOS', () => {
  test('harder schedule raises a team rank over equal-record peer', () => {
    const teamA = makeTeam('a', 70); // same prestige
    const teamB = makeTeam('b', 70);
    const records = {
      'a': makeRecord(5, 5, 100, 100),
      'b': makeRecord(5, 5, 100, 100),
    };
    // A played tougher opponents (avg 70%), B played weaker (avg 20%)
    const sos = { 'a': 0.7, 'b': 0.2 };
    const ranked = computeRankings([teamA, teamB], records, 2, sos);
    expect(ranked[0].teamId).toBe('a');
    expect(ranked[1].teamId).toBe('b');
  });

  test('without SOS argument, behaves like SOS = 0 for all teams', () => {
    const teams = [makeTeam('p', 80), makeTeam('q', 70)];
    const records = {
      'p': makeRecord(6, 0, 70, 30),
      'q': makeRecord(4, 2, 50, 40),
    };
    const withoutSos = computeRankings(teams, records, 2);
    const withZeroSos = computeRankings(teams, records, 2, { 'p': 0, 'q': 0 });
    expect(withoutSos[0].teamId).toBe(withZeroSos[0].teamId);
    expect(withoutSos[0].points).toBe(withZeroSos[0].points);
  });
});
