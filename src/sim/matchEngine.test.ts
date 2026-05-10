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
  offenseSet: 'balanced',
  defensePackage: 'man',
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

  test('motion offense set creates more attacking volume over a seed sample', () => {
    const rosterA = generateRoster(teamA, 'strategy-offense-test');
    const rosterB = generateRoster(teamB, 'strategy-offense-test');
    let balancedShots = 0;
    let motionShots = 0;

    for (let seed = 110; seed < 170; seed += 1) {
      const balanced = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        { ...tactics, offenseSet: 'balanced' },
        tactics,
        seed,
      );
      const motion = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        { ...tactics, offenseSet: 'motion' },
        tactics,
        seed,
      );
      balancedShots += balanced.statsA.shots;
      motionShots += motion.statsA.shots;
    }

    assert.ok(motionShots > balancedShots);
  });

  test('pressure defense package forces more opponent turnovers over a seed sample', () => {
    const rosterA = generateRoster(teamA, 'strategy-defense-test');
    const rosterB = generateRoster(teamB, 'strategy-defense-test');
    let pressureForcedTurnovers = 0;
    let zoneForcedTurnovers = 0;

    for (let seed = 210; seed < 270; seed += 1) {
      const pressure = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        { ...tactics, defensePackage: 'pressure' },
        seed,
      );
      const zone = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        { ...tactics, defensePackage: 'zone' },
        seed,
      );
      pressureForcedTurnovers += pressure.statsA.turnovers;
      zoneForcedTurnovers += zone.statsA.turnovers;
    }

    assert.ok(pressureForcedTurnovers > zoneForcedTurnovers);
  });
});
