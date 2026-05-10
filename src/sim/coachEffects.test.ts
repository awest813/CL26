import assert from 'node:assert';
import { describe, test } from 'node:test';
import { applyCoachWeekSettings, advanceFatigue, buildCoachGamePlan, summarizeCoachGamePlan } from './coachEffects.ts';

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
});
