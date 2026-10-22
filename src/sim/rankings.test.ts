import { describe, expect, test } from 'bun:test';
import {
  BAD_LOSS_PENALTY,
  computeAllSOS,
  computePollInputs,
  computeRankingBreakdown,
  computeRankings,
  MARGIN_CAP_PER_GAME,
  prestigeWeightShare,
  RANKING_WEIGHTS,
} from './rankings';
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
  test('total is the sum of its lines', () => {
    const team = makeTeam('t1', 80);
    const record = makeRecord(5, 0, 60, 30);
    const inputs = { sos: 0.6, cappedMargin: 18, qualityResults: 55, qualityWins: 2, badLosses: 0 };

    const breakdown = computeRankingBreakdown(team, record, inputs);
    expect(breakdown.strengthOfSchedulePoints).toBeCloseTo(0.6 * RANKING_WEIGHTS.strengthOfSchedule, 5);
    expect(breakdown.pointDifferentialPoints).toBeCloseTo(18 * RANKING_WEIGHTS.pointDifferential, 5);
    expect(breakdown.qualityResultPoints).toBe(55);
    expect(breakdown.totalPoints).toBeCloseTo(
      breakdown.overallWinPctPoints +
        breakdown.conferenceWinPctPoints +
        breakdown.pointDifferentialPoints +
        breakdown.prestigePoints +
        breakdown.strengthOfSchedulePoints +
        breakdown.qualityResultPoints,
      5,
    );
  });

  test('prestige carries the preseason and is gone by game ten', () => {
    const team = makeTeam('t2', 75);
    expect(computeRankingBreakdown(team, makeRecord(0, 0)).prestigePoints).toBeCloseTo(75 * RANKING_WEIGHTS.prestige, 5);
    expect(computeRankingBreakdown(team, makeRecord(3, 2)).prestigePoints).toBeCloseTo(75 * RANKING_WEIGHTS.prestige * 0.5, 5);
    expect(computeRankingBreakdown(team, makeRecord(6, 4)).prestigePoints).toBe(0);
    expect(prestigeWeightShare(12)).toBe(0);
  });
});

describe('computePollInputs', () => {
  test('caps each game margin, so a blowout counts like a five-goal win', () => {
    const results = [makeGameResult('a', 'b', 20, 2), makeGameResult('a', 'c', 9, 8)];
    const records = { a: makeRecord(2, 0), b: makeRecord(0, 1), c: makeRecord(0, 1) };
    const inputs = computePollInputs(results, records);
    expect(inputs.a.cappedMargin).toBe(MARGIN_CAP_PER_GAME + 1);
    expect(inputs.b.cappedMargin).toBe(-MARGIN_CAP_PER_GAME);
  });

  test('rewards wins over good teams and punishes losses to bad ones', () => {
    // g (3-1) beats s (strong, 3-1 after the loss). w (1-3) beats g: a bad loss for g.
    const results = [makeGameResult('g', 's', 10, 8), makeGameResult('w', 'g', 9, 7)];
    const records = {
      g: makeRecord(3, 1),
      s: makeRecord(3, 1),
      w: makeRecord(1, 3),
    };
    const inputs = computePollInputs(results, records);
    expect(inputs.g.qualityWins).toBe(1);
    expect(inputs.g.badLosses).toBe(1);
    expect(inputs.g.qualityResults).toBe(40 - BAD_LOSS_PENALTY);
    expect(inputs.w.qualityWins).toBe(1);
    expect(inputs.w.qualityResults).toBe(40);
  });

  test('strength of schedule counts opponents and their opponents', () => {
    // x played y; y also played z. x's SOS blends y's record with y's own schedule.
    const results = [makeGameResult('x', 'y', 8, 4), makeGameResult('y', 'z', 8, 4)];
    const records = { x: makeRecord(1, 0), y: makeRecord(1, 1), z: makeRecord(0, 1) };
    const inputs = computePollInputs(results, records);
    const owp = computeAllSOS(results, records);
    expect(inputs.x.sos).toBeCloseTo((2 * owp.x + owp.y) / 3, 5);
  });
});

describe('computeRankings with poll inputs', () => {
  test('harder schedule raises a team rank over equal-record peer', () => {
    const teamA = makeTeam('a', 70);
    const teamB = makeTeam('b', 70);
    const records = {
      'a': makeRecord(5, 5, 100, 100),
      'b': makeRecord(5, 5, 100, 100),
    };
    const inputs = {
      a: { sos: 0.7, cappedMargin: 0, qualityResults: 0, qualityWins: 0, badLosses: 0 },
      b: { sos: 0.2, cappedMargin: 0, qualityResults: 0, qualityWins: 0, badLosses: 0 },
    };
    const ranked = computeRankings([teamA, teamB], records, 2, inputs);
    expect(ranked[0].teamId).toBe('a');
    expect(ranked[1].teamId).toBe('b');
  });

  test('running up the score does not jump a team with better wins', () => {
    const bully = makeTeam('bully', 70);
    const grinder = makeTeam('grinder', 70);
    const records = { bully: makeRecord(10, 2), grinder: makeRecord(10, 2) };
    const inputs = {
      bully: { sos: 0.45, cappedMargin: 50, qualityResults: 0, qualityWins: 0, badLosses: 0 },
      grinder: { sos: 0.5, cappedMargin: 25, qualityResults: 120, qualityWins: 3, badLosses: 0 },
    };
    expect(computeRankings([bully, grinder], records, 2, inputs)[0].teamId).toBe('grinder');
  });

  test('uses deterministic prestige tie-breaker when rounded ranking points match', () => {
    const lowerPrestige = makeTeam('a', 65);
    const higherPrestige = makeTeam('b', 75);
    const records = {
      'a': makeRecord(6, 4, 44, 30),
      'b': makeRecord(6, 4, 44, 30),
    };

    const ranked = computeRankings([lowerPrestige, higherPrestige], records, 2);

    expect(ranked[0].teamId).toBe('b');
    expect(ranked[1].teamId).toBe('a');
  });
});
