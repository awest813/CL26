import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Team } from '../types/sim.ts';
import {
  advanceStaff,
  assistantCandidates,
  assistantEdge,
  generateStaff,
  staffEffects,
  type AssistantCoach,
} from './assistants.ts';
import { advanceFatigue, buildCoachGamePlan } from './coachEffects.ts';
import { DEFAULT_TACTICS } from './tactics.ts';

const team = (id: string, prestige: number): Team => ({ id, schoolName: id, nickname: 'X', conferenceId: 'c', region: 'North', prestige });

const staffAt = (rating: number): AssistantCoach[] =>
  (['OFFENSE', 'DEFENSE', 'RECRUITING', 'STRENGTH'] as const).map((role) => ({ id: role, name: role, role, rating, age: 40, tenure: 0 }));

describe('assistant coaches', () => {
  test('a 60 rating is neutral, a 95 is the ceiling, an empty seat hurts', () => {
    assert.equal(assistantEdge(60), 0);
    assert.equal(assistantEdge(95), 1);
    assert.ok(assistantEdge(48) < 0);
    const empty = staffEffects([]);
    assert.ok(empty.offense < 0 && empty.recruitingMultiplier < 1 && empty.fatigueScale > 1);
    // No staff at all (a CPU program, or a sim without a coach) changes nothing.
    assert.deepEqual(staffEffects(null).installBoost, { OFFENSE: 1, DEFENSE: 1, CONDITIONING: 1, DISCIPLINE: 1 });
  });

  test('better coordinators raise the game plan and the install they run', () => {
    const settings = { baseTactics: DEFAULT_TACTICS, practiceFocus: 'OFFENSE' as const, fatigue: 20 };
    const weak = buildCoachGamePlan({ ...settings, staff: staffAt(50) });
    const strong = buildCoachGamePlan({ ...settings, staff: staffAt(90) });
    const none = buildCoachGamePlan(settings);
    assert.ok(strong.modifiers.offense > none.modifiers.offense);
    assert.ok(none.modifiers.offense > weak.modifiers.offense);
    assert.ok(strong.modifiers.defense > none.modifiers.defense);
    // A staff never outweighs the install: an elite staff adds less than the install itself.
    assert.ok(strong.modifiers.offense - none.modifiers.offense < 3);
  });

  test('a strength coach slows fatigue build-up but not recovery', () => {
    const strong = staffEffects(staffAt(90)).fatigueScale;
    assert.ok(advanceFatigue(40, 'DEFENSE', 'RECRUITER', 0, strong) < advanceFatigue(40, 'DEFENSE'));
    assert.equal(advanceFatigue(40, 'CONDITIONING', 'RECRUITER', 0, strong), advanceFatigue(40, 'CONDITIONING'));
  });

  test('a bigger program starts with a better staff', () => {
    const avg = (staff: AssistantCoach[]) => staff.reduce((sum, coach) => sum + coach.rating, 0) / staff.length;
    let big = 0;
    let small = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      big += avg(generateStaff(team(`big${seed}`, 88), seed));
      small += avg(generateStaff(team(`small${seed}`, 50), seed));
    }
    assert.ok(big > small + 80, `big ${big / 20}, small ${small / 20}`);
    assert.deepEqual(generateStaff(team('t', 70), 1), generateStaff(team('t', 70), 1));
  });

  test('the best candidates want a bigger program', () => {
    const candidates = assistantCandidates(1, 2026, 'u');
    assert.equal(candidates.length, 12);
    const best = [...candidates].sort((a, b) => b.rating - a.rating)[0];
    const worst = [...candidates].sort((a, b) => a.rating - b.rating)[0];
    assert.ok(best.minPrestige > worst.minPrestige);
  });

  test('an offseason ages the staff, and top assistants get hired away', () => {
    let poached = 0;
    let retired = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const staff = staffAt(88).map((coach) => ({ ...coach, id: `${coach.id}-${seed}`, age: coach.role === 'STRENGTH' ? 67 : 40 }));
      const result = advanceStaff({ staff, seed, year: 2026, madePlayoffs: true, openings: [team('o1', 70), team('o2', 60)] });
      result.staff.forEach((coach) => assert.equal(coach.age, (coach.role === 'STRENGTH' ? 67 : 40) + 1));
      poached += result.departures.filter((row) => row.reason === 'head-coach').length;
      retired += result.departures.filter((row) => row.reason === 'retired').length;
      assert.ok(result.departures.filter((row) => row.reason === 'head-coach').length <= 2, 'one departure per opening');
    }
    assert.ok(poached > 10, `poached ${poached}`);
    assert.ok(retired > 5, `retired ${retired}`);
    const noOpenings = advanceStaff({ staff: staffAt(90), seed: 1, year: 2026, madePlayoffs: true, openings: [] });
    assert.ok(noOpenings.departures.every((row) => row.reason !== 'head-coach'));
  });
});
