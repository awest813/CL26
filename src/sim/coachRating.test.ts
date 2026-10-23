import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { coachStars, coachTier, coachToNextStar, headCoachRating, skillTreeLevels } from './coachRating.ts';

describe('coach stars', () => {
  test('ratings map to half stars', () => {
    assert.equal(coachStars(95), 5);
    assert.equal(coachStars(85), 5);
    assert.equal(coachStars(84), 4.5);
    assert.equal(coachStars(76), 4);
    assert.equal(coachStars(72), 3.5);
    assert.equal(coachStars(60), 2.5);
    assert.equal(coachStars(48), 1);
    assert.equal(coachStars(Number.NaN), 1);
  });

  test('a league-average assistant is two and a half stars and the poached ones are four', () => {
    assert.equal(coachStars(60), 2.5);
    assert.equal(coachTier(coachStars(76)), 'Proven');
  });

  test('skill-tree levels raise the head coach rating, capped at 99', () => {
    assert.equal(skillTreeLevels({ recruiting: 2, development: 1, operations: 0 }), 3);
    assert.equal(headCoachRating(72, { recruiting: 2, development: 1, operations: 0 }), 75);
    assert.equal(headCoachRating(95, { recruiting: 5, development: 5, operations: 5 }), 99);
    assert.equal(headCoachRating(72, undefined), 72);
  });

  test('distance to the next half star', () => {
    assert.deepEqual(coachToNextStar(72), { stars: 4, points: 3 });
    assert.equal(coachToNextStar(90), null);
    assert.equal(coachToNextStar(Number.NaN), null);
  });
});
