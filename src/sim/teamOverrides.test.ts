import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { applyTeamOverrides, cleanTeamOverride, validateTeamOverride } from './teamOverrides.ts';
import { defaultLetters, teamMark, TEAM_COLORS } from './teamMark.ts';
import { simulateGame } from './matchEngine.ts';
import { generateRoster } from './generateRoster.ts';
import { DEFAULT_TACTICS } from './tactics.ts';

const teams = leagueData.teams as Team[];
const [first, second] = teams;

describe('team overrides', () => {
  test('cleaning trims names, upper-cases letters, and drops blanks', () => {
    assert.deepEqual(cleanTeamOverride({ schoolName: '  Ridge   View  ', nickname: ' ', abbreviation: 'r-v.u', colorIndex: 3 }), { schoolName: 'Ridge View', abbreviation: 'RVU', colorIndex: 3 });
  });

  test('validation catches blank, long, duplicate, and malformed values', () => {
    assert.match(validateTeamOverride(first.id, { schoolName: '   ' }, teams).schoolName ?? '', /needs a name/);
    assert.match(validateTeamOverride(first.id, { schoolName: 'x'.repeat(60) }, teams).schoolName ?? '', /characters/);
    assert.match(validateTeamOverride(first.id, { schoolName: second.schoolName.toUpperCase() }, teams).schoolName ?? '', /already has/);
    assert.equal(validateTeamOverride(first.id, { schoolName: first.schoolName }, teams).schoolName, undefined, 'keeping your own name is fine');
    assert.match(validateTeamOverride(first.id, { abbreviation: 'A' }, teams).abbreviation ?? '', /2 to 4/);
    assert.equal(validateTeamOverride(first.id, { abbreviation: '' }, teams).abbreviation, undefined, 'blank letters fall back to the default');
    assert.ok(validateTeamOverride(first.id, { colorIndex: TEAM_COLORS.length }, teams).colorIndex);
  });

  test('edits change branding only', () => {
    const [edited] = applyTeamOverrides(teams, { [first.id]: { schoolName: 'Ridgeview', nickname: 'Hawks', abbreviation: 'RV', colorIndex: 2 } });
    assert.equal(edited.schoolName, 'Ridgeview');
    assert.equal(edited.nickname, 'Hawks');
    for (const key of ['id', 'conferenceId', 'region', 'prestige'] as const) assert.equal(edited[key], first[key]);
    assert.equal(applyTeamOverrides(teams, {}), teams, 'no edits returns the bundled list');
  });

  test('the logo follows the edit, and a rename without letters takes letters from the new name', () => {
    assert.equal(teamMark({ ...first, abbreviation: 'RV', colorIndex: 2 }).letters, 'RV');
    assert.equal(teamMark({ ...first, colorIndex: 2 }).primary, TEAM_COLORS[2].primary);
    assert.equal(defaultLetters({ id: first.id, schoolName: 'Ridgeview Polytechnic' }), 'RIPO');
    assert.equal(defaultLetters(first), teamMark(first).letters);
  });

  test('a renamed program plays exactly the same games', () => {
    const [renamed] = applyTeamOverrides(teams, { [first.id]: { schoolName: 'Ridgeview', nickname: 'Hawks' } });
    const rosterA = generateRoster(first, 'rename');
    const rosterB = generateRoster(second, 'rename');
    for (let seed = 1; seed <= 10; seed += 1) {
      const before = simulateGame({ team: first, roster: rosterA }, { team: second, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      const after = simulateGame({ team: renamed, roster: rosterA }, { team: second, roster: rosterB }, DEFAULT_TACTICS, DEFAULT_TACTICS, seed);
      assert.equal(`${after.scoreA}-${after.scoreB}`, `${before.scoreA}-${before.scoreB}`);
    }
  });
});
