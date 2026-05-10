import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSigningDay, summarizeSigningClass } from './offseason.ts';
import type { Player, Position } from '../types/sim.ts';

type RecruitShape = Parameters<typeof resolveSigningDay>[0][number];

function makePlayer(id: string, position: Position): Player {
  return {
    id,
    name: `Player ${id}`,
    position,
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
  };
}

function makeRecruit(id: string, stars: number, potential: number, position: RecruitShape['position'] = 'M'): RecruitShape {
  return {
    id,
    name: `Recruit ${id}`,
    position,
    stars,
    region: 'Northeast',
    potential,
    committedTeamId: null,
    motivations: [],
    dealbreaker: null,
    interestByTeamId: {},
  };
}

const recruits: RecruitShape[] = [
  makeRecruit('a', 3, 80),
  makeRecruit('b', 5, 70),
  makeRecruit('c', 4, 91),
  makeRecruit('d', 4, 86),
];

test('resolveSigningDay prioritizes stars then potential with scholarship cap', () => {
  const result = resolveSigningDay(recruits, 2);
  assert.deepEqual(result.signedRecruitIds, ['b', 'c']);
  assert.deepEqual(result.unsignedRecruitIds, ['d', 'a']);
});

test('summarizeSigningClass returns compact class quality metrics', () => {
  const result = summarizeSigningClass(recruits);
  assert.equal(result.totalStars, 16);
  assert.equal(result.averageStars, 4);
  assert.equal(result.blueChipCount, 3);
});

test('resolveSigningDay factors positional roster needs into team-building', () => {
  const classPool: RecruitShape[] = [
    makeRecruit('elite-mid', 5, 95, 'M'),
    makeRecruit('solid-goalie', 4, 86, 'G'),
    makeRecruit('solid-faceoff', 4, 84, 'FO'),
  ];

  const roster = Array.from({ length: 7 }, (_, i) => makePlayer(`m-${i}`, 'M'));

  const result = resolveSigningDay(classPool, 2, roster);
  assert.ok(result.signedRecruitIds.includes('solid-goalie'));
  assert.ok(result.signedRecruitIds.includes('solid-faceoff'));
  assert.ok(result.unsignedRecruitIds.includes('elite-mid'));
});
