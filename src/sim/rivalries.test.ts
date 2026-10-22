import assert from 'node:assert';
import { describe, test } from 'node:test';
import { buildRivalries, rivalOf, rivalryFor, RIVALRY_WEEK_INDEX } from './rivalries.ts';
import { generateSeasonSchedule, validateSchedule } from './schedule.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Conference, Team } from '../types/sim.ts';

const teams = leagueData.teams as Team[];
const conferences = leagueData.conferences as Conference[];
const teamById = new Map(teams.map((team) => [team.id, team]));

describe('rivalries', () => {
  test('every program has exactly one rival, in its region and another conference', () => {
    const rivalries = buildRivalries(teams);
    assert.strictEqual(rivalries.length, teams.length / 2);
    const seen = new Set<string>();
    for (const { teamIds: [a, b] } of rivalries) {
      assert.ok(!seen.has(a) && !seen.has(b), `${a} or ${b} has two rivals`);
      seen.add(a);
      seen.add(b);
      const teamA = teamById.get(a) as Team;
      const teamB = teamById.get(b) as Team;
      assert.strictEqual(teamA.region, teamB.region);
      assert.notStrictEqual(teamA.conferenceId, teamB.conferenceId);
    }
    assert.strictEqual(seen.size, teams.length);
  });

  test('every rivalry has its own trophy', () => {
    const trophies = buildRivalries(teams).map((rivalry) => rivalry.trophy);
    assert.strictEqual(new Set(trophies).size, trophies.length);
    assert.ok(trophies.every((trophy) => trophy.startsWith('The ')));
  });

  test('rivals stay the same from season to season', () => {
    assert.deepStrictEqual(buildRivalries([...teams]), buildRivalries(teams));
    const rivalry = rivalryFor(buildRivalries(teams), teams[0].id);
    assert.ok(rivalry);
    assert.strictEqual(rivalOf(rivalry, rivalOf(rivalry, teams[0].id)), teams[0].id);
  });
});

describe('rivalry week', () => {
  for (const seed of [1, 2026, 99999]) {
    test(`closes the regular season with every rivalry game (seed ${seed})`, () => {
      const schedule = generateSeasonSchedule(teams, conferences, seed);
      assert.deepStrictEqual(validateSchedule(schedule, teams), []);

      const rivalryWeek = schedule[RIVALRY_WEEK_INDEX];
      assert.ok(rivalryWeek.every((game) => game.rivalryTrophy && !game.conferenceGame));
      const key = (a: string, b: string) => [a, b].sort().join('|');
      const rivalPairs = new Set(buildRivalries(teams).map(({ teamIds: [a, b] }) => key(a, b)));
      assert.deepStrictEqual(new Set(rivalryWeek.map((game) => key(game.homeTeamId, game.awayTeamId))), rivalPairs);

      const earlier = schedule.slice(0, RIVALRY_WEEK_INDEX).flat();
      assert.ok(earlier.every((game) => !rivalPairs.has(key(game.homeTeamId, game.awayTeamId))), 'rivals met before rivalry week');
      assert.ok(earlier.every((game) => !game.rivalryTrophy));
    });
  }
});

describe('regional non-conference games', () => {
  test('the open weeks lean toward opponents from the same region', () => {
    const regionById = new Map(teams.map((team) => [team.id, team.region]));
    let regional = 0;
    let total = 0;
    for (const seed of [3, 4, 5]) {
      const schedule = generateSeasonSchedule(teams, conferences, seed);
      for (const game of schedule.slice(7, RIVALRY_WEEK_INDEX).flat()) {
        total += 1;
        if (regionById.get(game.homeTeamId) === regionById.get(game.awayTeamId)) regional += 1;
      }
    }
    // A random draw would make about one game in nine regional.
    const share = regional / total;
    assert.ok(share > 0.35 && share < 0.9, `${(share * 100).toFixed(0)}% regional`);
  });
});
