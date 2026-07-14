import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Player } from '../types/sim.ts';
import { applyWeeklyTraitGrowth, developPlayers } from './rosterManagement.ts';
import { makeRng } from './rng.ts';

const basePlayer = (id: string): Player => ({
  id,
  name: `Player ${id}`,
  position: 'M',
  year: 2,
  age: 19,
  skill: 70,
  shooting: 70,
  passing: 70,
  speed: 70,
  defense: 70,
  IQ: 70,
  stamina: 70,
  discipline: 70,
  overall: 70,
});

describe('roster management progression systems', () => {
  test('weekly trait growth is deterministic for same seed/week/focus', () => {
    const roster = [basePlayer('p1'), basePlayer('p2'), basePlayer('p3')];
    const first = applyWeeklyTraitGrowth(roster, 2027, 3, 'OFFENSE', {
      developmentSkill: 2,
      facilitiesLevel: 68,
      coachSkill: 78,
    });
    const second = applyWeeklyTraitGrowth(roster, 2027, 3, 'OFFENSE', {
      developmentSkill: 2,
      facilitiesLevel: 68,
      coachSkill: 78,
    });
    assert.deepStrictEqual(first, second);
  });

  test('offense focus prioritizes shooting/passing over defense', () => {
    const roster = Array.from({ length: 8 }, (_, i) => basePlayer(`off-${i}`));
    const grown = applyWeeklyTraitGrowth(roster, 4040, 4, 'OFFENSE', {
      developmentSkill: 3,
      facilitiesLevel: 72,
      coachSkill: 82,
    });
    const totalShootGain = grown.reduce((sum, p) => sum + (p.shooting - 70), 0);
    const totalPassGain = grown.reduce((sum, p) => sum + (p.passing - 70), 0);
    const totalDefenseGain = grown.reduce((sum, p) => sum + (p.defense - 70), 0);
    assert.ok(totalShootGain + totalPassGain >= totalDefenseGain);
  });

  test('facilities and development skill raise offseason growth ceiling', () => {
    const roster = Array.from({ length: 10 }, (_, i) => ({
      ...basePlayer(`dev-${i}`),
      year: 1 as const,
    }));
    const lowSupport = developPlayers(roster, makeRng(111), {
      coachArchetype: 'RECRUITER',
      developmentSkill: 0,
      facilitiesLevel: 35,
      operationsSkill: 0,
      boostersLevel: 40,
    });
    const highSupport = developPlayers(roster, makeRng(111), {
      coachArchetype: 'DEVELOPER',
      developmentSkill: 4,
      facilitiesLevel: 90,
      operationsSkill: 3,
      boostersLevel: 85,
    });

    const lowOverallGain = lowSupport.reduce((sum, p) => sum + (p.overall - 70), 0);
    const highOverallGain = highSupport.reduce((sum, p) => sum + (p.overall - 70), 0);
    assert.ok(highOverallGain >= lowOverallGain);
  });

  test('offseason development soft-caps elite attributes', () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...basePlayer(`cap-${i}`),
      year: 1 as const,
      shooting: 91,
      passing: 91,
      speed: 91,
      defense: 91,
      IQ: 91,
      stamina: 91,
      discipline: 91,
      overall: 91,
      skill: 91,
    }));
    const grown = developPlayers(roster, makeRng(222), {
      coachArchetype: 'DEVELOPER',
      developmentSkill: 5,
      facilitiesLevel: 95,
      operationsSkill: 5,
      boostersLevel: 95,
    });
    assert.ok(grown.every((player) => player.overall <= 94));
    assert.ok(grown.every((player) => player.shooting <= 93));
  });
});
