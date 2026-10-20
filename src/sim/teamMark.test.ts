import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import teamsData from '../data/teams128.json' with { type: 'json' };
import { letterOptions, teamMark } from './teamMark.ts';

describe('team marks', () => {
  test('every school has a unique two-to-four letter mark', () => {
    const marks = teamsData.teams.map((team) => teamMark(team));
    const letters = marks.map((mark) => mark.letters);
    assert.equal(new Set(letters).size, teamsData.teams.length);
    assert.ok(letters.every((value) => value.length >= 2 && value.length <= 4));
    assert.ok(letters.every((value) => /^[A-Z0-9]+$/.test(value)));
  });

  test('marks stay put for the same school', () => {
    const hilltop = teamsData.teams.find((team) => team.schoolName === 'Hilltop University');
    assert.ok(hilltop);
    assert.equal(teamMark(hilltop).letters, 'HILL');
    assert.deepEqual(teamMark(hilltop), teamMark(hilltop));
    assert.equal(letterOptions('Blue Ridge University')[0], 'BLRI');
    assert.equal(letterOptions('New York City College')[0], 'NYC');
    assert.equal(letterOptions('Rivergate A&M')[0], 'RIAM');
  });

  test('logo colors are dark enough for light lettering', () => {
    for (const team of teamsData.teams) {
      const mark = teamMark(team);
      assert.match(mark.primary, /^#[0-9a-f]{6}$/);
      assert.match(mark.secondary, /^#[0-9a-f]{6}$/);
      assert.match(mark.ink, /^#[0-9a-f]{6}$/);
      const red = Number.parseInt(mark.primary.slice(1, 3), 16);
      const green = Number.parseInt(mark.primary.slice(3, 5), 16);
      const blue = Number.parseInt(mark.primary.slice(5, 7), 16);
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      assert.ok(luminance < 0.45, `${team.schoolName} primary is too light`);
    }
  });
});
