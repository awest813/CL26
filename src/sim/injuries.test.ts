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

describe('injuries that last', () => {
  test('a multi-week injury counts down week to week', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed += 1) {
      const roster = generateRoster(team, `league-season-${seed}`);
      for (let week = 0; week < 11 && !found; week += 1) {
        const now = weeklyScratches(roster, seed, `w${week}`, team.id);
        const lasting = now.find((scratch) => scratch.weeksLeft != null && scratch.weeksLeft >= 2);
        if (!lasting) continue;
        const next = weeklyScratches(roster, seed, `w${week + 1}`, team.id).find((scratch) => scratch.playerId === lasting.playerId);
        assert.ok(next, `${lasting.name} should still be out the next week`);
        assert.equal(next.weeksLeft, (lasting.weeksLeft as number) - 1);
        assert.equal(next.injury, lasting.injury);
        found = true;
      }
    }
    assert.ok(found, 'no multi-week injury in 60 seasons');
  });

  test('a season-ending injury carries into the bracket', () => {
    let found = false;
    for (let seed = 1; seed <= 400 && !found; seed += 1) {
      const roster = generateRoster(team, `league-season-${seed}`);
      const lostForYear = weeklyScratches(roster, seed, 'w11', team.id).find((scratch) => scratch.weeksLeft === null);
      if (!lostForYear) continue;
      assert.ok(weeklyScratches(roster, seed, 'FINAL', team.id).some((scratch) => scratch.playerId === lostForYear.playerId));
      found = true;
    }
    assert.ok(found, 'no season-ending injury in 400 seasons');
  });

  test('a regular week or a playoff round has only a handful of players out', () => {
    let total = 0;
    let samples = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const roster = generateRoster(team, `league-season-${seed}`);
      for (const key of ['w3', 'w8', 'w11', 'SEMIFINAL']) {
        total += weeklyScratches(roster, seed, key, team.id).length;
        samples += 1;
      }
    }
    const average = total / samples;
    assert.ok(average > 0.5 && average < 2.5, `about ${average.toFixed(2)} players out a week`);
  });
});
