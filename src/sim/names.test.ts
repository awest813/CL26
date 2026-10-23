import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import namesData from '../data/names.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { generateRoster } from './generateRoster.ts';
import { generateRecruitPool } from './recruiting.ts';
import { drawName } from './names.ts';
import { makeRng } from './rng.ts';

const teams = leagueData.teams as Team[];

describe('names', () => {
  test('the lists have no repeats', () => {
    assert.equal(new Set(namesData.firstNames).size, namesData.firstNames.length);
    assert.equal(new Set(namesData.lastNames).size, namesData.lastNames.length);
    assert.ok(namesData.firstNames.length >= 200 && namesData.lastNames.length >= 300);
  });

  test('a draw takes exactly two values from the caller, even when it has to redraw', () => {
    const probe = makeRng(7);
    const name = drawName(probe);
    const taken = new Set([name]);
    const rng = makeRng(7);
    const redrawn = drawName(rng, taken);
    assert.notEqual(redrawn, name);
    const reference = makeRng(7);
    reference();
    reference();
    assert.equal(rng(), reference());
  });

  test('no roster or recruiting class repeats a name, and nobody is called "Chase Chase"', () => {
    const everyone: string[] = [];
    for (const team of teams) {
      const names = generateRoster(team, '2026').map((player) => player.name);
      assert.equal(new Set(names).size, names.length, team.id);
      everyone.push(...names);
    }
    const pool = generateRecruitPool(2026).map((recruit) => recruit.name);
    assert.equal(new Set(pool).size, pool.length);
    for (const name of [...everyone, ...pool]) {
      const [first, last] = name.split(' ');
      assert.notEqual(first, last, name);
    }
    // Across the league a name can recur, but rarely.
    assert.ok(new Set(everyone).size > everyone.length * 0.9);
  });

  test('names are deterministic', () => {
    assert.deepEqual(
      generateRoster(teams[0], 'seed').map((player) => player.name),
      generateRoster(teams[0], 'seed').map((player) => player.name),
    );
  });
});
