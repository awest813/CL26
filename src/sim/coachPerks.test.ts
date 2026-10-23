import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Recruit } from '../types/sim.ts';
import { staffEffects, type AssistantCoach } from './assistants.ts';
import { hasPerk, perkGameDayEdges, perkGrowthBonus, recruitEdgeScale, recruitingEdges } from './coachPerks.ts';
import { userWeeklyGain } from './recruitingWeek.ts';

function assistant(role: AssistantCoach['role'], specialty?: AssistantCoach['specialty']): AssistantCoach {
  return { id: `a-${role}`, name: 'Test', role, rating: 60, age: 40, tenure: 2, specialty };
}

const staff = (['OFFENSE', 'DEFENSE', 'RECRUITING', 'STRENGTH'] as const).map((role) => assistant(role));

describe('head coach perks', () => {
  test('a perk only counts in the branch it belongs to', () => {
    assert.ok(hasPerk({ development: 'YOUNG_CORE' }, 'YOUNG_CORE'));
    assert.ok(!hasPerk({ operations: 'YOUNG_CORE' }, 'YOUNG_CORE'));
    assert.ok(!hasPerk(undefined, 'GRINDER'));
  });

  test('development perks split the roster by class year', () => {
    assert.equal(perkGrowthBonus({ development: 'YOUNG_CORE' }, 1), 1);
    assert.equal(perkGrowthBonus({ development: 'YOUNG_CORE' }, 4), 0);
    assert.equal(perkGrowthBonus({ development: 'FINISHING_SCHOOL' }, 3), 1);
    assert.equal(perkGrowthBonus({}, 1), 0);
  });

  test('operations perks add game-day edges', () => {
    assert.deepEqual(perkGameDayEdges({ operations: 'FILM_ROOM' }), { offense: 0.25, defense: 0.25, wearRelief: 0, fatigueDragScale: 1 });
    assert.equal(perkGameDayEdges({ operations: 'FRESH_LEGS' }).fatigueDragScale, 0.9);
  });

  test('recruiting perks raise the weekly gain', () => {
    const recruit = { id: 'r1', stars: 3, region: 'North', motivations: [] } as unknown as Recruit;
    const base = { recruit, hours: 10, gainMultiplier: 1, coachSkill: 72, programPrestige: 70, positionNeedBonus: 0 };
    const plain = userWeeklyGain(base);
    const grinder = userWeeklyGain({ ...base, edges: recruitingEdges({ recruiting: 'GRINDER' }, null, 'North') });
    assert.ok(grinder > plain, `${grinder} > ${plain}`);
  });
});

describe('assistant specialties', () => {
  test('specialties add to their role', () => {
    const plain = staffEffects(staff);
    const withSpecialties = staffEffects([
      assistant('OFFENSE', 'PLAY_CALLER'),
      assistant('DEFENSE', 'GOALIE_COACH'),
      assistant('RECRUITING', 'CLOSER'),
      assistant('STRENGTH', 'ENDURANCE'),
    ]);
    assert.ok(Math.abs(withSpecialties.installBoost.OFFENSE - plain.installBoost.OFFENSE - 0.06) < 1e-9);
    assert.ok(Math.abs(withSpecialties.goalie - plain.goalie - 0.3) < 1e-9);
    assert.ok(Math.abs(plain.fatigueScale - withSpecialties.fatigueScale - 0.05) < 1e-9);
    assert.equal(withSpecialties.defense, plain.defense);
  });

  test('a specialty on the wrong role does nothing', () => {
    assert.deepEqual(staffEffects([assistant('STRENGTH', 'PRESSURE')]), staffEffects([assistant('STRENGTH')]));
  });

  test('the recruiting coordinator scales blue chips or home prospects', () => {
    const closer = recruitingEdges(undefined, [assistant('RECRUITING', 'CLOSER')], 'North');
    assert.equal(recruitEdgeScale(closer, { stars: 4, region: 'South' }), 1.08);
    assert.equal(recruitEdgeScale(closer, { stars: 3, region: 'North' }), 1);
    const hometown = recruitingEdges(undefined, [assistant('RECRUITING', 'HOMETOWN')], 'North');
    assert.equal(recruitEdgeScale(hometown, { stars: 3, region: 'North' }), 1.1);
  });
});
