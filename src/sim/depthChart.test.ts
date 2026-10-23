import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { generateRoster } from './generateRoster.ts';
import { bestLineup, depthChartSlots, lineupGap, startingRating, STARTER_SLOTS, swapStarter, weakestStarter } from './depthChart.ts';
import { POSITION_ORDER } from '../types/sim.ts';

const team = (leagueData.teams as Team[])[10];
const roster = generateRoster(team, 'depth');

describe('depth chart', () => {
  test('the best lineup fills every slot and leaves nothing on the bench', () => {
    const best = bestLineup(roster);
    const slots = depthChartSlots(roster, best);
    for (const position of POSITION_ORDER) {
      assert.equal(slots[position].length, STARTER_SLOTS[position]);
      assert.ok(slots[position].every((slot) => slot.player !== null), position);
    }
    assert.deepEqual(lineupGap(roster, best), []);
  });

  test('swapping a backup in replaces the starter; swapping two starters trades their slots', () => {
    const best = bestLineup(roster);
    const attack = roster.filter((player) => player.position === 'A');
    const backup = attack.find((player) => !best.includes(player.id))!;
    const [first, second] = best.filter((id) => attack.some((player) => player.id === id));
    const replaced = swapStarter(best, first, backup.id);
    assert.equal(replaced.length, best.length);
    assert.ok(replaced.includes(backup.id) && !replaced.includes(first));
    const traded = swapStarter(best, first, second);
    assert.equal(traded.indexOf(second), best.indexOf(first));
    assert.equal(traded.indexOf(first), best.indexOf(second));
    assert.equal(new Set(traded).size, traded.length, 'nobody starts twice');
  });

  test('a weaker lineup shows the points it leaves on the bench, and the weakest starter is the one to replace', () => {
    const best = bestLineup(roster);
    const attack = roster.filter((player) => player.position === 'A');
    const backup = [...attack].filter((player) => !best.includes(player.id)).sort((a, b) => a.overall - b.overall)[0];
    const starter = best.find((id) => attack.some((player) => player.id === id))!;
    const worse = swapStarter(best, starter, backup.id);
    const gap = lineupGap(roster, worse);
    assert.equal(gap.length, 1);
    assert.equal(gap[0].position, 'A');
    assert.ok(gap[0].points > 0);
    const weakest = weakestStarter(roster, worse, 'A');
    assert.ok(weakest && startingRating(weakest) <= Math.min(...depthChartSlots(roster, worse).A.map((slot) => startingRating(slot.player!))));
  });

  test('a redshirt never fills a slot', () => {
    const best = bestLineup(roster);
    const goalie = roster.find((player) => player.id === depthChartSlots(roster, best).G[0].player!.id)!;
    const redshirted = roster.map((player) => (player.id === goalie.id ? { ...player, redshirt: true } : player));
    assert.equal(depthChartSlots(redshirted, best).G[0].player, null);
    assert.ok(!bestLineup(redshirted).includes(goalie.id));
  });
});
