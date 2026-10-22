import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  applyCoachWeekSettings,
  treeLevelEdge,
  advanceFatigue,
  playoffRoundFatigue,
  buildCoachGamePlan,
  gameDayTacticChanges,
  summarizeCoachGamePlan,
  weeklyFatigueChange,
} from './coachEffects.ts';

const base = {
  tempo: 'normal' as const,
  rideClear: 'balanced' as const,
  slideAggression: 'normal' as const,
};

describe('coach effects', () => {
  test('offense focus pushes tempo and late slides', () => {
    const next = applyCoachWeekSettings({ baseTactics: base, practiceFocus: 'OFFENSE', fatigue: 20 });
    assert.strictEqual(next.tempo, 'fast');
    assert.strictEqual(next.slideAggression, 'late');
  });

  test('high fatigue forces slow tempo', () => {
    const next = applyCoachWeekSettings({ baseTactics: base, practiceFocus: 'OFFENSE', fatigue: 70 });
    assert.strictEqual(next.tempo, 'slow');
  });

  test('conditioning keeps a slow tempo the coach chose', () => {
    const next = applyCoachWeekSettings({ baseTactics: { ...base, tempo: 'slow' }, practiceFocus: 'CONDITIONING', fatigue: 20 });
    assert.strictEqual(next.tempo, 'slow');
  });

  test('game-day changes name the install as the cause of its own calls', () => {
    const changes = gameDayTacticChanges({ baseTactics: base, practiceFocus: 'OFFENSE', fatigue: 20 });
    assert.deepStrictEqual(changes, [
      { key: 'tempo', from: 'normal', to: 'fast', cause: 'install' },
      { key: 'slideAggression', from: 'normal', to: 'late', cause: 'install' },
    ]);
  });

  test('game-day changes blame fatigue when it overrides the install', () => {
    const changes = gameDayTacticChanges({ baseTactics: base, practiceFocus: 'OFFENSE', fatigue: 70 });
    assert.deepStrictEqual(changes, [
      { key: 'tempo', from: 'normal', to: 'slow', cause: 'fatigue' },
      { key: 'slideAggression', from: 'normal', to: 'late', cause: 'install' },
    ]);
  });

  test('a conditioning week with a fresh team changes no calls', () => {
    assert.deepStrictEqual(gameDayTacticChanges({ baseTactics: base, practiceFocus: 'CONDITIONING', fatigue: 20 }), []);
  });

  test('weekly fatigue change matches one week of advanceFatigue', () => {
    assert.strictEqual(weeklyFatigueChange('OFFENSE'), advanceFatigue(50, 'OFFENSE') - 50);
    assert.ok(weeklyFatigueChange('CONDITIONING') < 0);
    assert.ok(weeklyFatigueChange('DEFENSE', 'TACTICIAN') < weeklyFatigueChange('DEFENSE', 'RECRUITER'));
  });

  test('conditioning focus builds less fatigue than defense focus', () => {
    const conditioning = advanceFatigue(20, 'CONDITIONING');
    const defense = advanceFatigue(20, 'DEFENSE');
    assert.ok(conditioning < defense);
  });

  test('tactician translates offense prep into a larger game boost', () => {
    const recruiterPlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'OFFENSE',
      fatigue: 22,
      archetype: 'RECRUITER',
    });
    const tacticianPlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'OFFENSE',
      fatigue: 22,
      archetype: 'TACTICIAN',
    });

    assert.ok(tacticianPlan.modifiers.offense > recruiterPlan.modifiers.offense);
    assert.ok(tacticianPlan.modifiers.shotQuality > recruiterPlan.modifiers.shotQuality);
  });

  test('high fatigue meaningfully drags the weekly plan', () => {
    const freshPlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'DEFENSE',
      fatigue: 18,
      archetype: 'TACTICIAN',
    });
    const tiredPlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'DEFENSE',
      fatigue: 82,
      archetype: 'TACTICIAN',
    });

    assert.ok(freshPlan.modifiers.defense > tiredPlan.modifiers.defense);
    assert.strictEqual(tiredPlan.fatigueLabel, 'Drained');
  });

  test('summary highlights the main strengths of a discipline week', () => {
    const plan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'DISCIPLINE',
      fatigue: 30,
      archetype: 'DEVELOPER',
    });
    const summary = summarizeCoachGamePlan(plan);

    assert.ok(summary.some((line) => line.includes('avoidable flags')));
  });

  test('operations skill reduces weekly fatigue accumulation', () => {
    const baseline = advanceFatigue(25, 'DEFENSE', 'RECRUITER', 0);
    const skilledOps = advanceFatigue(25, 'DEFENSE', 'RECRUITER', 5);
    assert.ok(skilledOps < baseline);
  });

  test('load management never slows a recovery week', () => {
    const plain = advanceFatigue(40, 'CONDITIONING', 'RECRUITER', 0);
    assert.strictEqual(advanceFatigue(40, 'CONDITIONING', 'TACTICIAN', 5), plain);
  });

  test('playoff round rest recovers fatigue; playing advances it', () => {
    const rested = playoffRoundFatigue(60, false, 'OFFENSE', 'RECRUITER', 0);
    const played = playoffRoundFatigue(60, true, 'OFFENSE', 'RECRUITER', 0);
    assert.ok(rested < 60);
    assert.ok(played > 60);
  });

  test('skill tree boosts lacrosse control points in the game plan', () => {
    const basePlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'CONDITIONING',
      fatigue: 25,
      archetype: 'RECRUITER',
      coachSkill: 70,
      skillTree: { recruiting: 0, development: 0, operations: 0 },
    });
    const skilledPlan = buildCoachGamePlan({
      baseTactics: base,
      practiceFocus: 'CONDITIONING',
      fatigue: 25,
      archetype: 'RECRUITER',
      coachSkill: 82,
      skillTree: { recruiting: 4, development: 3, operations: 5 },
    });

    assert.ok(skilledPlan.modifiers.faceoff > basePlan.modifiers.faceoff);
    assert.ok(skilledPlan.modifiers.groundBallBonus > basePlan.modifiers.groundBallBonus);
    assert.ok(skilledPlan.modifiers.penaltyAvoidance > basePlan.modifiers.penaltyAvoidance);
  });
});

describe('skill tree game-day value', () => {
  test('each level adds less than the last, and level 5 is worth three', () => {
    const values = [0, 1, 2, 3, 4, 5].map(treeLevelEdge);
    for (let level = 1; level <= 5; level += 1) {
      assert.ok(values[level] > values[level - 1], `level ${level} should still help`);
    }
    for (let level = 2; level <= 5; level += 1) {
      assert.ok(values[level] - values[level - 1] < values[level - 1] - values[level - 2], `level ${level} should add less`);
    }
    assert.strictEqual(treeLevelEdge(5), 3);
    assert.strictEqual(treeLevelEdge(9), 3, 'levels past the cap add nothing');
  });
});
