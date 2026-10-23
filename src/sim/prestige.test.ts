import assert from 'node:assert';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import {
  formatPrestige,
  prestigeCushion,
  prestigeStars,
  prestigeStarText,
  prestigeTier,
  prestigeToNextStar,
  programPullBand,
} from './prestige.ts';
import { programPull } from './recruitingWeek.ts';
import { nextPrestigeDrift } from './programLedger.ts';

describe('prestige stars', () => {
  test('maps prestige to half stars from 1 to 5', () => {
    assert.strictEqual(prestigeStars(95), 5);
    assert.strictEqual(prestigeStars(86), 5);
    assert.strictEqual(prestigeStars(85.9), 4.5);
    assert.strictEqual(prestigeStars(71), 3.5);
    assert.strictEqual(prestigeStars(66), 3);
    assert.strictEqual(prestigeStars(51), 1.5);
    assert.strictEqual(prestigeStars(20), 1);
    assert.strictEqual(prestigeStars(Number.NaN), 1);
  });

  test('the base league is a pyramid with few five-star and one-star programs', () => {
    const counts = new Map<number, number>();
    (leagueData.teams as Team[]).forEach((team) => {
      const stars = prestigeStars(team.prestige);
      counts.set(stars, (counts.get(stars) ?? 0) + 1);
    });
    assert.ok((counts.get(5) ?? 0) <= 10, `five-star programs: ${counts.get(5)}`);
    assert.ok((counts.get(1) ?? 0) <= 10, `one-star programs: ${counts.get(1)}`);
    // Every half step has programs in it.
    assert.strictEqual(counts.size, 9);
  });

  test('names tiers and writes stars as text', () => {
    assert.strictEqual(prestigeTier(5), 'Blue blood');
    assert.strictEqual(prestigeTier(3.5), 'Established');
    assert.strictEqual(prestigeTier(1), 'Underdog');
    assert.strictEqual(prestigeStarText(3.5), '★★★½');
    assert.strictEqual(prestigeStarText(4), '★★★★');
  });

  test('reports the distance to the next star and the cushion above the current one', () => {
    assert.deepStrictEqual(prestigeToNextStar(73), { stars: 4, points: 3 });
    assert.strictEqual(prestigeToNextStar(90), null);
    assert.strictEqual(prestigeCushion(73), 2);
    assert.strictEqual(prestigeCushion(30), null);
    assert.strictEqual(formatPrestige(72), '72');
    assert.strictEqual(formatPrestige(72.34), '72.3');
  });

  test('a prospect sees a program of his own caliber as a fit and a far smaller one as a long shot', () => {
    // An N-star prospect expects an N-star program: the middle of that tier.
    assert.strictEqual(programPull(88, 5), 1);
    assert.strictEqual(programPull(68, 3), 1);
    assert.strictEqual(prestigeStars(68), 3);
    assert.strictEqual(programPullBand(programPull(88, 5)), 'even');
    assert.strictEqual(programPullBand(programPull(60, 5)), 'longShot');
    assert.strictEqual(programPullBand(programPull(90, 2)), 'strong');
    assert.strictEqual(programPullBand(programPull(74, 4)), 'reach');
  });

  test('earned prestige fades and stays inside its bounds', () => {
    assert.strictEqual(nextPrestigeDrift(10, 0), 9);
    assert.strictEqual(nextPrestigeDrift(10, 4), 13);
    assert.strictEqual(nextPrestigeDrift(29, 4), 30);
    assert.strictEqual(nextPrestigeDrift(-19, -3), -20);
  });
});
