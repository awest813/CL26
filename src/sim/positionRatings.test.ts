import assert from 'node:assert';
import { describe, test } from 'node:test';
import { POSITION_TRAIT_WEIGHTS, positionOverall, rerateAtPosition } from './positionRatings.ts';
import { generateRoster } from './generateRoster.ts';
import { entrantToPlayer } from './offseasonMarket.ts';
import { applyWeeklyTraitGrowth } from './rosterManagement.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Player, Position, Team } from '../types/sim.ts';

const teams = leagueData.teams as Team[];
const POSITIONS: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
const base: Player = {
  id: 'p', name: 'Test Player', position: 'D', year: 2, age: 19, skill: 70,
  shooting: 70, passing: 70, speed: 70, defense: 70, IQ: 70, stamina: 70, discipline: 70,
  overall: 70, faceoff: 70, saving: 70, potential: 80,
};

describe('position overall', () => {
  test('every position weighs its traits to a total of one', () => {
    for (const position of POSITIONS) {
      const total = Object.values(POSITION_TRAIT_WEIGHTS[position]).reduce((sum, weight) => sum + (weight ?? 0), 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${position} weights sum to ${total}`);
    }
  });

  test('a defenseman is rated on his defense, not his shot', () => {
    const d = { ...base, position: 'D' as const };
    assert.ok(positionOverall({ ...d, defense: 90 }) - positionOverall(d) >= 8);
    assert.ok(positionOverall({ ...d, shooting: 90 }) - positionOverall(d) <= 1);
  });

  test('an attackman is rated on his shot, a goalie on his saves, a faceoff man at the dot', () => {
    assert.ok(positionOverall({ ...base, position: 'A', shooting: 90 }) - positionOverall({ ...base, position: 'A' }) >= 7);
    assert.ok(positionOverall({ ...base, position: 'G', saving: 90 }) - positionOverall({ ...base, position: 'G' }) >= 11);
    assert.ok(positionOverall({ ...base, position: 'FO', faceoff: 90 }) - positionOverall({ ...base, position: 'FO' }) >= 10);
    assert.strictEqual(positionOverall({ ...base, position: 'G', shooting: 99 }), positionOverall({ ...base, position: 'G' }));
  });

  test('a given overall means the same standing at every position', () => {
    const byPosition: Record<string, number[]> = {};
    for (const team of teams) for (const player of generateRoster(team, 'position-standing')) (byPosition[player.position] ??= []).push(player.overall);
    const means = POSITIONS.map((position) => byPosition[position].reduce((sum, value) => sum + value, 0) / byPosition[position].length);
    assert.ok(Math.max(...means) - Math.min(...means) < 1.5, `position means ${means.map((mean) => mean.toFixed(1)).join(', ')}`);
  });

  test('a generated player is listed at his position overall', () => {
    for (const player of generateRoster(teams[12], 'listed')) assert.strictEqual(player.overall, positionOverall(player));
  });
});

describe('players from outside the roster', () => {
  test('a transfer is listed at the rating the board showed, with his position\'s shape', () => {
    for (const position of POSITIONS) {
      const player = entrantToPlayer({ id: `t-${position}`, name: 'Portal Player', position, year: 2, age: 20, overall: 78, originTeamId: 'x', originName: 'X' });
      assert.ok(Math.abs(player.overall - 78) <= 1, `${position} listed 78, rated ${player.overall}`);
    }
    const d = entrantToPlayer({ id: 't-d', name: 'Portal D', position: 'D', year: 2, age: 20, overall: 78, originTeamId: 'x', originName: 'X' });
    assert.ok(d.defense > d.shooting + 10, 'a transfer defenseman defends better than he shoots');
  });

  test('re-rating a saved player keeps his room to grow', () => {
    const saved = { ...base, position: 'G' as const, saving: 90, overall: 70, potential: 80 };
    const rerated = rerateAtPosition(saved);
    assert.notStrictEqual(rerated.overall, saved.overall);
    assert.strictEqual((rerated.potential ?? 0) - rerated.overall, 10);
  });
});

describe('specialists in weekly practice', () => {
  test('a faceoff man and a goalie get work at their specialty whatever the install', () => {
    const roster = [{ ...base, id: 'fo', position: 'FO' as const, faceoff: 70 }, { ...base, id: 'g', position: 'G' as const, saving: 70 }];
    let grown = roster;
    for (let week = 0; week < 40; week += 1) grown = applyWeeklyTraitGrowth(grown, 9, week, 'OFFENSE');
    assert.ok((grown[0].faceoff ?? 0) > 70, 'faceoff should grow');
    assert.ok((grown[1].saving ?? 0) > 70, 'saving should grow');
    for (const player of grown) assert.strictEqual(player.overall, positionOverall(player));
  });
});
