// @ts-nocheck
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildRecordsFromResults } from './seasonSim.ts';
import type { GameSummary, Team } from '../types/sim.ts';

describe('buildRecordsFromResults', () => {
  const teams: Team[] = [
    { id: 'team-A', schoolName: 'A', nickname: 'A', conferenceId: 'conf-1', region: 'East', prestige: 50 },
    { id: 'team-B', schoolName: 'B', nickname: 'B', conferenceId: 'conf-1', region: 'East', prestige: 50 },
    { id: 'team-C', schoolName: 'C', nickname: 'C', conferenceId: 'conf-2', region: 'West', prestige: 50 },
  ];

  const teamConferenceMap = {
    'team-A': 'conf-1',
    'team-B': 'conf-1',
    'team-C': 'conf-2',
  };

  test('should initialize blank records for all teams when no games played', () => {
    const records = buildRecordsFromResults(teams, [], teamConferenceMap);

    assert.deepStrictEqual(records['team-A'], {
      wins: 0,
      losses: 0,
      confWins: 0,
      confLosses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
    assert.deepStrictEqual(records['team-B'], {
      wins: 0,
      losses: 0,
      confWins: 0,
      confLosses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
    assert.deepStrictEqual(records['team-C'], {
      wins: 0,
      losses: 0,
      confWins: 0,
      confLosses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  });

  test('should update records correctly for a non-conference home win', () => {
    const game: GameSummary = {
      id: 'game-1',
      weekIndex: 1,
      homeTeamId: 'team-A',
      awayTeamId: 'team-C',
      homeScore: 10,
      awayScore: 5,
      teamStatsHome: {} as any,
      teamStatsAway: {} as any,
    };

    const records = buildRecordsFromResults(teams, [[game]], teamConferenceMap);

    assert.strictEqual(records['team-A'].wins, 1);
    assert.strictEqual(records['team-A'].losses, 0);
    assert.strictEqual(records['team-A'].confWins, 0); // Non-conference game
    assert.strictEqual(records['team-A'].pointsFor, 10);
    assert.strictEqual(records['team-A'].pointsAgainst, 5);

    assert.strictEqual(records['team-C'].wins, 0);
    assert.strictEqual(records['team-C'].losses, 1);
    assert.strictEqual(records['team-C'].confLosses, 0); // Non-conference game
    assert.strictEqual(records['team-C'].pointsFor, 5);
    assert.strictEqual(records['team-C'].pointsAgainst, 10);
  });

  test('should update records correctly for a conference away win', () => {
    const game: GameSummary = {
      id: 'game-2',
      weekIndex: 1,
      homeTeamId: 'team-A',
      awayTeamId: 'team-B',
      homeScore: 7,
      awayScore: 12,
      teamStatsHome: {} as any,
      teamStatsAway: {} as any,
    };

    const records = buildRecordsFromResults(teams, [[game]], teamConferenceMap);

    assert.strictEqual(records['team-B'].wins, 1);
    assert.strictEqual(records['team-B'].losses, 0);
    assert.strictEqual(records['team-B'].confWins, 1);
    assert.strictEqual(records['team-B'].pointsFor, 12);
    assert.strictEqual(records['team-B'].pointsAgainst, 7);

    assert.strictEqual(records['team-A'].wins, 0);
    assert.strictEqual(records['team-A'].losses, 1);
    assert.strictEqual(records['team-A'].confLosses, 1);
    assert.strictEqual(records['team-A'].pointsFor, 7);
    assert.strictEqual(records['team-A'].pointsAgainst, 12);
  });

  test('should handle tie game edge case as an away win', () => {
    // Current implementation treats homeScore <= awayScore as an away win
    const game: GameSummary = {
      id: 'game-tie',
      weekIndex: 1,
      homeTeamId: 'team-A',
      awayTeamId: 'team-B',
      homeScore: 10,
      awayScore: 10,
      teamStatsHome: {} as any,
      teamStatsAway: {} as any,
    };

    const records = buildRecordsFromResults(teams, [[game]], teamConferenceMap);

    assert.strictEqual(records['team-A'].wins, 0);
    assert.strictEqual(records['team-A'].losses, 1);
    assert.strictEqual(records['team-B'].wins, 1);
    assert.strictEqual(records['team-B'].losses, 0);
  });

  test('should aggregate multiple games across weeks correctly', () => {
    const week1: GameSummary[] = [
      {
        id: 'w1-1',
        weekIndex: 1,
        homeTeamId: 'team-A',
        awayTeamId: 'team-C',
        homeScore: 15, // A wins non-conf
        awayScore: 5,
        teamStatsHome: {} as any,
        teamStatsAway: {} as any,
      },
    ];

    const week2: GameSummary[] = [
      {
        id: 'w2-1',
        weekIndex: 2,
        homeTeamId: 'team-B',
        awayTeamId: 'team-A',
        homeScore: 10, // B wins conf
        awayScore: 8,
        teamStatsHome: {} as any,
        teamStatsAway: {} as any,
      },
      {
        id: 'w2-2',
        weekIndex: 2,
        homeTeamId: 'team-C',
        awayTeamId: 'team-B',
        homeScore: 6, // C wins non-conf (wait, B is playing twice? Just for aggregation test)
        awayScore: 4,
        teamStatsHome: {} as any,
        teamStatsAway: {} as any,
      },
    ];

    const records = buildRecordsFromResults(teams, [week1, week2], teamConferenceMap);

    // team-A: Won vs C (15-5), Lost vs B (8-10). Total: 1-1, conf: 0-1, PF: 23, PA: 15
    assert.strictEqual(records['team-A'].wins, 1);
    assert.strictEqual(records['team-A'].losses, 1);
    assert.strictEqual(records['team-A'].confWins, 0);
    assert.strictEqual(records['team-A'].confLosses, 1);
    assert.strictEqual(records['team-A'].pointsFor, 23);
    assert.strictEqual(records['team-A'].pointsAgainst, 15);

    // team-B: Won vs A (10-8), Lost vs C (4-6). Total: 1-1, conf: 1-0, PF: 14, PA: 14
    assert.strictEqual(records['team-B'].wins, 1);
    assert.strictEqual(records['team-B'].losses, 1);
    assert.strictEqual(records['team-B'].confWins, 1);
    assert.strictEqual(records['team-B'].confLosses, 0);
    assert.strictEqual(records['team-B'].pointsFor, 14);
    assert.strictEqual(records['team-B'].pointsAgainst, 14);

    // team-C: Lost vs A (5-15), Won vs B (6-4). Total: 1-1, conf: 0-0, PF: 11, PA: 19
    assert.strictEqual(records['team-C'].wins, 1);
    assert.strictEqual(records['team-C'].losses, 1);
    assert.strictEqual(records['team-C'].confWins, 0);
    assert.strictEqual(records['team-C'].confLosses, 0);
    assert.strictEqual(records['team-C'].pointsFor, 11);
    assert.strictEqual(records['team-C'].pointsAgainst, 19);
  });
});
