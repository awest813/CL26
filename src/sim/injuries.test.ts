import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { generateRoster } from './generateRoster.ts';
import { rosterForAvailability, weeklyScratches } from './injuries.ts';
import { buildDefaultStarters } from './rosterManagement.ts';
import type { Player, Position } from '../types/sim.ts';

const team = {
  id: 'hilltop',
  schoolName: 'Hilltop',
  nickname: 'Hawks',
  conferenceId: 'east',
  region: 'East',
  prestige: 62,
};

const MIN_AVAILABLE: Record<Position, number> = { A: 3, M: 3, D: 3, LSM: 1, FO: 1, G: 1 };

function counts(roster: Player[]): Record<Position, number> {
  const tally: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  for (const player of roster) tally[player.position] += 1;
  return tally;
}

describe('weekly scratches', () => {
  test('the same week is stable and an empty week keeps the roster reference', () => {
    const roster = generateRoster(team, 'league-season-9');
    const starters = buildDefaultStarters(roster);
    const first = weeklyScratches(roster, 9, 'w0', team.id);
    const second = weeklyScratches(roster, 9, 'w0', team.id);
    assert.deepEqual(second, first);

    const untouched = rosterForAvailability(roster, starters, []);
    assert.equal(untouched.roster, roster);
    assert.equal(untouched.starterIds, starters);
  });

  test('a scratch leaves every position able to field and promotes a replacement', () => {
    const roster = generateRoster(team, 'league-season-4');
    const starters = buildDefaultStarters(roster);
    let sawScratch = false;
    let sawHealthyWeek = false;

    for (let week = 0; week < 24; week += 1) {
      const scratches = weeklyScratches(roster, 4, `w${week}`, team.id);
      if (scratches.length === 0) {
        sawHealthyWeek = true;
        continue;
      }
      sawScratch = true;
      const available = rosterForAvailability(roster, starters, scratches);
      const left = counts(available.roster);
      for (const position of Object.keys(MIN_AVAILABLE) as Position[]) {
        assert.ok(left[position] >= MIN_AVAILABLE[position], `${position} dropped below a lineup`);
      }
      for (const scratch of scratches) {
        assert.equal(available.roster.some((player) => player.id === scratch.playerId), false);
        const wasStarter = starters.includes(scratch.playerId);
        if (wasStarter) {
          const replacement = available.starterIds.some((id) => {
            const player = available.roster.find((candidate) => candidate.id === id);
            return player?.position === scratch.position && id !== scratch.playerId;
          });
          assert.equal(replacement, true);
        }
      }
    }

    assert.equal(sawScratch, true);
    assert.equal(sawHealthyWeek, true);
  });
});
