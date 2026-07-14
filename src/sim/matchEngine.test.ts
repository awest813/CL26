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

    let baselineGoals = 0;
    let boostedGoals = 0;
    let baselineShots = 0;
    let boostedShots = 0;
    for (let seed = 40; seed < 80; seed += 1) {
      const baseline = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        tactics,
        seed,
        { homeAdvantageForA: false },
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
        seed,
        { homeAdvantageForA: false },
      );
      baselineGoals += baseline.scoreA;
      boostedGoals += boosted.scoreA;
      baselineShots += baseline.statsA.shots;
      boostedShots += boosted.statsA.shots;
    }

    assert.ok(boostedGoals > baselineGoals);
    assert.ok(boostedShots >= baselineShots);
  });

  test('discipline modifiers reduce empty-possession mistakes', () => {
    const rosterA = generateRoster(teamA, 'discipline-test');
    const rosterB = generateRoster(teamB, 'discipline-test');

    let sloppyMistakes = 0;
    let cleanMistakes = 0;
    for (let seed = 70; seed < 110; seed += 1) {
      const sloppy = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        { ...tactics, rideClear: 'aggressive' },
        tactics,
        seed,
        { homeAdvantageForA: false },
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
        seed,
        { homeAdvantageForA: false },
      );
      sloppyMistakes += sloppy.statsA.turnovers + sloppy.statsA.penalties;
      cleanMistakes += clean.statsA.turnovers + clean.statsA.penalties;
    }

    assert.ok(cleanMistakes < sloppyMistakes);
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

  test('pressure defense package creates more loose-ball production than zone over a seed sample', () => {
    const rosterA = generateRoster(teamA, 'strategy-defense-test');
    const rosterB = generateRoster(teamB, 'strategy-defense-test');
    let pressureGroundBalls = 0;
    let zoneGroundBalls = 0;

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
      pressureGroundBalls += pressure.statsB.groundBalls;
      zoneGroundBalls += zone.statsB.groundBalls;
    }

    assert.ok(pressureGroundBalls > zoneGroundBalls);
  });

  test('high-end offense can trigger scoring-run gameplay highlights', () => {
    const rosterA = generateRoster(teamA, 'strategy-run-highlight');
    const rosterB = generateRoster(teamB, 'strategy-run-highlight');
    let foundScoringRunHighlight = false;

    for (let seed = 500; seed < 680; seed += 1) {
      const result = simulateGame(
        {
          team: teamA,
          roster: rosterA,
          gameplan: {
            offense: 8,
            defense: 0,
            goalie: 0,
            faceoff: 0,
            discipline: 0,
            shotQuality: 0.06,
            turnoverAvoidance: 0,
            penaltyAvoidance: 0,
            groundBallBonus: 0,
          },
        },
        { team: teamB, roster: rosterB },
        { ...tactics, tempo: 'fast', offenseSet: 'crease' },
        { ...tactics, tempo: 'slow', defensePackage: 'zone' },
        seed,
      );

      if (result.highlights.some((line) => line.includes('-goal run.'))) {
        foundScoringRunHighlight = true;
        break;
      }
    }

    assert.ok(foundScoringRunHighlight);
  });

  test('penalties do not inflate caused turnovers', () => {
    const rosterA = generateRoster(teamA, 'penalty-cto');
    const rosterB = generateRoster(teamB, 'penalty-cto');
    const result = simulateGame(
      { team: teamA, roster: rosterA },
      { team: teamB, roster: rosterB },
      tactics,
      tactics,
      77,
    );

    assert.ok((result.statsA.causedTurnovers ?? 0) <= result.statsB.turnovers);
    assert.ok((result.statsB.causedTurnovers ?? 0) <= result.statsA.turnovers);
  });

  test('faceoff percentages are on a 0-100 scale and sum near 100', () => {
    const rosterA = generateRoster(teamA, 'fo-pct');
    const rosterB = generateRoster(teamB, 'fo-pct');
    const result = simulateGame(
      { team: teamA, roster: rosterA },
      { team: teamB, roster: rosterB },
      tactics,
      tactics,
      88,
    );

    assert.ok(result.statsA.faceoffPct >= 0 && result.statsA.faceoffPct <= 100);
    assert.ok(result.statsB.faceoffPct >= 0 && result.statsB.faceoffPct <= 100);
    assert.ok(Math.abs(result.statsA.faceoffPct + result.statsB.faceoffPct - 100) < 0.2);
  });

  test('player goal totals match team scores', () => {
    const rosterA = generateRoster(teamA, 'goal-attribution');
    const rosterB = generateRoster(teamB, 'goal-attribution');
    const result = simulateGame(
      { team: teamA, roster: rosterA },
      { team: teamB, roster: rosterB },
      tactics,
      tactics,
      91,
    );

    const goalsA = result.topPlayersA.reduce((sum, player) => sum + player.goals, 0);
    const goalsB = result.topPlayersB.reduce((sum, player) => sum + player.goals, 0);
    // topPlayers is capped at 5 per side, so only assert when totals fit in the board
    if (result.topPlayersA.length < 5) {
      assert.strictEqual(goalsA, result.scoreA);
    } else {
      assert.ok(goalsA <= result.scoreA);
    }
    if (result.topPlayersB.length < 5) {
      assert.strictEqual(goalsB, result.scoreB);
    } else {
      assert.ok(goalsB <= result.scoreB);
    }
  });

  test('home-field advantage improves home scoring edge over a seed sample', () => {
    const rosterA = generateRoster(teamA, 'home-field');
    const rosterB = generateRoster(teamB, 'home-field');

    let homeEdge = 0;
    let neutralEdge = 0;
    for (let seed = 200; seed < 260; seed += 1) {
      const home = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        tactics,
        seed,
        { homeAdvantageForA: true },
      );
      const neutral = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        tactics,
        seed,
        { homeAdvantageForA: false },
      );
      homeEdge += home.scoreA - home.scoreB;
      neutralEdge += neutral.scoreA - neutral.scoreB;
    }

    assert.ok(homeEdge > neutralEdge, `expected home edge ${homeEdge} > neutral ${neutralEdge}`);
  });

  test('pressure defense draws more defensive penalties than man package', () => {
    const rosterA = generateRoster(teamA, 'def-pen');
    const rosterB = generateRoster(teamB, 'def-pen');
    const pressure: Tactics = { ...tactics, defensePackage: 'pressure', slideAggression: 'early' };
    const man: Tactics = { ...tactics, defensePackage: 'man', slideAggression: 'normal' };

    let pressureFouls = 0;
    let manFouls = 0;
    for (let seed = 300; seed < 340; seed += 1) {
      const pressureGame = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        pressure,
        seed,
        { homeAdvantageForA: false },
      );
      const manGame = simulateGame(
        { team: teamA, roster: rosterA },
        { team: teamB, roster: rosterB },
        tactics,
        man,
        seed,
        { homeAdvantageForA: false },
      );
      pressureFouls += pressureGame.statsB.penalties;
      manFouls += manGame.statsB.penalties;
    }

    assert.ok(pressureFouls > manFouls, `expected pressure fouls ${pressureFouls} > man ${manFouls}`);
  });
});
