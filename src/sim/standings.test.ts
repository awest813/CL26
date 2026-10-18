import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareConferenceStanding, compareOverallStanding } from './standings.ts';

const base = { wins: 4, losses: 2, confWins: 2, confLosses: 1, pointsFor: 40, pointsAgainst: 30 };

describe('standings order', () => {
  test('conference ties break on point differential, then name', () => {
    const rows = [
      { name: 'Zebra', record: { ...base, pointsFor: 50, pointsAgainst: 40 } },
      { name: 'Alpha', record: { ...base, pointsFor: 60, pointsAgainst: 30 } },
      { name: 'Middle', record: { ...base, pointsFor: 60, pointsAgainst: 30 } },
    ];
    const ordered = [...rows].sort(compareConferenceStanding).map((row) => row.name);
    assert.deepEqual(ordered, ['Alpha', 'Middle', 'Zebra']);
  });

  test('overall ties break on losses, then point differential', () => {
    const rows = [
      { name: 'Even', record: { ...base, wins: 6, losses: 2, pointsFor: 70, pointsAgainst: 40 } },
      { name: 'Cleaner', record: { ...base, wins: 6, losses: 1, pointsFor: 55, pointsAgainst: 50 } },
      { name: 'Margin', record: { ...base, wins: 6, losses: 2, pointsFor: 80, pointsAgainst: 30 } },
    ];
    const ordered = [...rows].sort(compareOverallStanding).map((row) => row.name);
    assert.deepEqual(ordered, ['Cleaner', 'Margin', 'Even']);
  });
});
