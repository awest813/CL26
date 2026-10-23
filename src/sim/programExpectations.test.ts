import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { expectationsFromPrestige, expectedWinsForPrestige, situationFromPrestige } from './programExpectations.ts';

const teams = leagueData.teams as Team[];

describe('program expectations', () => {
  test('no program is asked for more wins than a program of its standing gets', () => {
    for (const team of teams) {
      const expected = expectedWinsForPrestige(team.prestige);
      const { winTarget } = expectationsFromPrestige(team.prestige);
      // The floor of 3 wins is the only place a target can sit above par.
      assert.ok(winTarget <= Math.max(3, expected), `${team.id} prestige ${team.prestige}: target ${winTarget}, par ${expected.toFixed(1)}`);
      assert.ok(winTarget >= 3 && winTarget <= 9);
    }
  });

  test('the top of the league is asked for more than the bottom', () => {
    const top = expectationsFromPrestige(90);
    const middle = expectationsFromPrestige(68);
    const bottom = expectationsFromPrestige(48);
    assert.ok(top.winTarget > middle.winTarget && middle.winTarget > bottom.winTarget);
    assert.ok(top.rankTarget < middle.rankTarget && middle.rankTarget < bottom.rankTarget);
    assert.ok(top.securityBaseline > bottom.securityBaseline);
  });

  test('situations follow the star rating', () => {
    assert.equal(situationFromPrestige(90), 'CONTENDER');
    assert.equal(situationFromPrestige(81), 'CONTENDER');
    assert.equal(situationFromPrestige(80), 'STABLE');
    assert.equal(situationFromPrestige(61), 'STABLE');
    assert.equal(situationFromPrestige(60), 'REBUILD');
    const counts = { REBUILD: 0, STABLE: 0, CONTENDER: 0 };
    teams.forEach((team) => { counts[situationFromPrestige(team.prestige)] += 1; });
    assert.ok(counts.CONTENDER >= 15 && counts.CONTENDER <= 30, JSON.stringify(counts));
    assert.ok(counts.REBUILD >= 25 && counts.REBUILD <= 45, JSON.stringify(counts));
  });
});
