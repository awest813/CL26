import assert from 'node:assert';
import { describe, test } from 'node:test';
import { resolveDeadlockWinner, simulateGame } from './matchEngine.ts';
import { generateRoster } from './generateRoster.ts';
import type { Team, Tactics } from '../types/sim.ts';

const teamA: Team = {
  id: 'alpha',
  schoolName: 'Alpha State',
  nickname: 'Arrows',
  conferenceId: 'conf-a',
  region: 'East',
  prestige: 4,
};

const teamB: Team = {
  id: 'beta',
  schoolName: 'Beta Tech',
  nickname: 'Breakers',
  conferenceId: 'conf-b',
  region: 'West',
  prestige: 4,
};

const tactics: Tactics = {
  tempo: 'normal',
  rideClear: 'balanced',
  slideAggression: 'normal',
};

describe('match engine gameplay modifiers', () => {
  test('deadlock winner resolution uses bounded probabilities', () => {
    assert.strictEqual(resolveDeadlockWinner(() => 0.34, 0, 10_000), 'A');
    assert.strictEqual(resolveDeadlockWinner(() => 0.36, 0, 10_000), 'B');
    assert.strictEqual(resolveDeadlockWinner(() => 0.64, 10_000, 0), 'A');
    assert.strictEqual(resolveDeadlockWinner(() => 0.66, 10_000, 0), 'B');
  });

  test('games always resolve with a winner', () => {
    const rosterA = generateRoster(teamA, 'overtime-test');
    const rosterB = generateRoster(teamB, 'overtime-test');

    for (let seed = 1; seed <= 200; seed += 1) {
      const result = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        tactics,
        seed,
      );

      assert.notStrictEqual(result.scoreA, result.scoreB, `seed ${seed} produced a tie`);
    }
  });

  test('offense-focused gameplan creates a stronger attacking output', () => {
    const rosterA = generateRoster(teamA, 'gameplan-test');
    const rosterB = generateRoster(teamB, 'gameplan-test');

    const baseline = simulateGame(
      { team: teamA, roster: rosterA },
      { team: teamB, roster: rosterB },
      tactics,
      tactics,
      42,
    );
    const boosted = simulateGame(
      {
        team: teamA,
        roster: rosterA,
        gameplan: {
          offense: 8,
          defense: 0,
          goalie: 0,
          faceoff: 0,
          discipline: 0,
          shotQuality: 0.08,
          turnoverAvoidance: 0,
          penaltyAvoidance: 0,
          groundBallBonus: 0,
        },
      },
      { team: teamB, roster: rosterB },
      tactics,
      tactics,
      42,
    );

    assert.ok(boosted.scoreA > baseline.scoreA);
    assert.ok(boosted.statsA.shots >= baseline.statsA.shots);
  });

  test('discipline modifiers reduce empty-possession mistakes', () => {
    const rosterA = generateRoster(teamA, 'discipline-test');
    const rosterB = generateRoster(teamB, 'discipline-test');

    const sloppy = simulateGame(
      { team: teamA, roster: rosterA },
      { team: teamB, roster: rosterB },
      { ...tactics, rideClear: 'aggressive' },
      tactics,
      77,
    );
    const clean = simulateGame(
      {
        team: teamA,
        roster: rosterA,
        gameplan: {
          offense: 0,
          defense: 0,
          goalie: 0,
          faceoff: 0,
          discipline: 8,
          shotQuality: 0,
          turnoverAvoidance: 0.08,
          penaltyAvoidance: 0.06,
          groundBallBonus: 0,
        },
      },
      { team: teamB, roster: rosterB },
      { ...tactics, rideClear: 'aggressive' },
      tactics,
      77,
    );

    assert.ok(clean.statsA.turnovers < sloppy.statsA.turnovers);
    assert.ok(
      clean.statsA.turnovers + clean.statsA.penalties <
        sloppy.statsA.turnovers + sloppy.statsA.penalties,
    );
  });
});
