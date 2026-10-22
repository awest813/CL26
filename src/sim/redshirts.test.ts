import assert from 'node:assert';
import { describe, test } from 'node:test';
import { activeRoster, advanceClassYear, canChangeRedshirts, redshirtBlocker } from './redshirts.ts';
import { generateRoster } from './generateRoster.ts';
import { applyRosterTurnover } from './rosterManagement.ts';
import type { Player, Team } from '../types/sim.ts';

const team: Team = { id: 'rs', schoolName: 'Redshirt U', nickname: 'Reds', conferenceId: 'c1', region: 'East', prestige: 70 };
const roster = generateRoster(team, 'redshirts');
const freshman = roster.find((player) => player.year === 1 && player.position === 'M') as Player;

describe('redshirts', () => {
  test('a redshirt sits out and keeps his class year a season later', () => {
    const sitting = roster.map((player) => (player.id === freshman.id ? { ...player, redshirt: true } : player));
    assert.ok(!activeRoster(sitting).some((player) => player.id === freshman.id));
    assert.strictEqual(activeRoster(roster), roster, 'no redshirts keeps the same roster');

    const next = advanceClassYear({ ...freshman, redshirt: true });
    assert.strictEqual(next.year, 1);
    assert.strictEqual(next.age, freshman.age + 1);
    assert.strictEqual(next.redshirt, false);
    assert.strictEqual(next.redshirtUsed, true);
    assert.strictEqual(advanceClassYear(freshman).year, 2);
  });

  test('offseason turnover keeps a redshirt in his class', () => {
    const sitting = roster.map((player) => (player.id === freshman.id ? { ...player, redshirt: true } : player));
    const next = applyRosterTurnover(sitting, [], team, 99);
    const after = next.find((player) => player.id === freshman.id);
    assert.ok(after, 'this seed keeps him on the roster');
    assert.strictEqual(after.year, 1);
    assert.strictEqual(after.redshirtUsed, true);
  });

  test('one per player, never a senior, and never so many that a position cannot play', () => {
    assert.strictEqual(redshirtBlocker(freshman, roster), null);
    assert.match(redshirtBlocker({ ...freshman, redshirtUsed: true }, roster) ?? '', /already used/);
    const senior = roster.find((player) => player.year === 4) as Player;
    assert.match(redshirtBlocker(senior, roster) ?? '', /Seniors/);
    const goalies = roster.filter((player) => player.position === 'G');
    const thin = roster.map((player) => (player.position === 'G' && player.id !== goalies[0].id && player.id !== goalies[1]?.id ? { ...player, redshirt: true } : player));
    const lastTwo = thin.filter((player) => player.position === 'G' && !player.redshirt);
    assert.match(redshirtBlocker({ ...lastTwo[0], year: 1 }, thin) ?? '', /too thin/);
  });

  test('can only change before week 1', () => {
    assert.strictEqual(canChangeRedshirts({ phase: 'REGULAR', currentWeekIndex: 0 }), true);
    assert.strictEqual(canChangeRedshirts({ phase: 'REGULAR', currentWeekIndex: 1 }), false);
    assert.strictEqual(canChangeRedshirts({ phase: 'OFFSEASON', currentWeekIndex: 12 }), false);
  });
});
