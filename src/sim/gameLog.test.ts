import assert from 'node:assert';
import { describe, test } from 'node:test';
import leagueData from '../data/teams128.json' with { type: 'json' };
import type { Team } from '../types/sim.ts';
import { generateRoster } from './generateRoster.ts';
import { simulateGame } from './matchEngine.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import { buildLineScore, leadChanges, scoringByPeriod } from './gameLog.ts';

const teams = leagueData.teams as Team[];

describe('game log', () => {
  test('the engine logs every goal and the line score adds up to the final', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const a = teams[seed % 20];
      const b = teams[40 + (seed % 30)];
      const result = simulateGame(
        { team: a, roster: generateRoster(a, 'log') },
        { team: b, roster: generateRoster(b, 'log') },
        DEFAULT_TACTICS,
        DEFAULT_TACTICS,
        seed,
      );
      const plays = result.scoringPlays ?? [];
      assert.strictEqual(plays.length, result.scoreA + result.scoreB, `seed ${seed}`);
      const line = buildLineScore(plays, a.id);
      assert.strictEqual(line.totalA, result.scoreA);
      assert.strictEqual(line.totalB, result.scoreB);
      const last = plays[plays.length - 1];
      if (last) {
        assert.strictEqual(last.scoreA, result.scoreA);
        assert.strictEqual(last.scoreB, result.scoreB);
      }
      // Goals stay in game order.
      plays.forEach((play, index) => {
        if (index > 0) assert.ok(play.period >= plays[index - 1].period);
      });
      assert.strictEqual(scoringByPeriod(plays).reduce((sum, group) => sum + group.plays.length, 0), plays.length);
    }
  });

  test('counts lead changes, ties, and the largest lead', () => {
    const play = (teamId: string, scoreA: number, scoreB: number) => ({
      period: 1, periodLabel: 'Q1', clock: '10:00', teamId, scorer: 'X', scoreA, scoreB,
    });
    const swing = leadChanges([play('a', 1, 0), play('b', 1, 1), play('b', 1, 2), play('a', 2, 2), play('a', 3, 2), play('a', 4, 2)]);
    assert.deepStrictEqual(swing, { leadChanges: 2, ties: 2, largestLeadA: 2, largestLeadB: 1 });
  });

  test('overtime goals get their own column', () => {
    const line = buildLineScore([
      { period: 4, periodLabel: 'Q4', clock: '1:00', teamId: 'a', scorer: 'X', scoreA: 1, scoreB: 0 },
      { period: 5, periodLabel: 'OT', clock: '2:10', teamId: 'b', scorer: 'Y', scoreA: 1, scoreB: 1 },
    ], 'a');
    assert.deepStrictEqual(line.periods, ['Q1', 'Q2', 'Q3', 'Q4', 'OT']);
    assert.deepStrictEqual(line.goalsB, [0, 0, 0, 0, 1]);
  });
});
