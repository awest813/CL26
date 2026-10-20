import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Player, Position } from '../types/sim.ts';
import { estimateWinChance } from './winEstimate.ts';

function player(id: string, overall: number, position: Position = 'M'): Player {
  return {
    id,
    name: id,
    position,
    year: 2,
    age: 20,
    skill: overall,
    shooting: overall,
    passing: overall,
    speed: overall,
    defense: overall,
    IQ: overall,
    stamina: overall,
    discipline: overall,
    overall,
  };
}

const base = {
  userPrestige: 60,
  userRoster: [player('u', 74)],
  opponentPrestige: 60,
  offense: 0,
  defense: 0,
  faceoff: 0,
  fatigue: 20,
  isHome: true,
};

describe('win estimate', () => {
  test('a stronger opponent roster lowers the estimate', () => {
    const even = estimateWinChance({ ...base, opponentRoster: [player('o', 74)] });
    const tough = estimateWinChance({ ...base, opponentRoster: [player('o', 90)] });
    assert.ok(tough < even);
  });

  test('scratching the user roster lowers the estimate', () => {
    const healthy = estimateWinChance({
      ...base,
      userRoster: [player('a', 80), player('b', 80)],
      opponentRoster: [player('o', 70)],
    });
    const short = estimateWinChance({
      ...base,
      userRoster: [player('b', 60)],
      opponentRoster: [player('o', 70)],
    });
    assert.ok(short < healthy);
  });
});