import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { seasonPhaseRailLabel } from '../../lib/seasonLabels.ts';
import type { GameResult, SeasonState } from '../../types/sim.ts';
import { seasonReducer, simCurrentWeek } from './seasonSlice.ts';

function weekResult(weekIndex: number, id = `g-${weekIndex}`): GameResult {
  const stats = {
    goals: 1,
    shots: 2,
    saves: 0,
    turnovers: 0,
    groundBalls: 0,
    penalties: 0,
    faceoffPct: 50,
  };
  return {
    id,
    weekIndex,
    seed: 1,
    teamAId: 'a',
    teamBId: 'b',
    teamAName: 'A',
    teamBName: 'B',
    scoreA: 10,
    scoreB: 8,
    statsA: { ...stats, teamId: 'a' },
    statsB: { ...stats, teamId: 'b' },
    topPlayersA: [],
    topPlayersB: [],
    highlights: [],
  };
}

function regularSeason(): SeasonState {
  return {
    year: 2026,
    currentWeekIndex: 0,
    completedWeeks: 0,
    gameResults: [],
    scheduleByWeek: [
      [{ id: 'g-0', weekIndex: 0, homeTeamId: 'a', awayTeamId: 'b', conferenceGame: false }],
      [{ id: 'g-1', weekIndex: 1, homeTeamId: 'a', awayTeamId: 'b', conferenceGame: true }],
    ],
    isComplete: false,
    phase: 'REGULAR',
    seasonSeed: 1,
    playoffs: null,
    previousRankByTeamId: {},
    lastAppliedWeekSimId: null,
  };
}

describe('simCurrentWeek reducer', () => {
  test('applies a week once and ignores a duplicate fulfill', () => {
    const first = simCurrentWeek.fulfilled(
      { results: [weekResult(0)], previousRankByTeamId: { a: 1 } },
      'req-1',
      undefined,
    );
    let state = seasonReducer(regularSeason(), first);
    assert.equal(state.currentWeekIndex, 1);
    assert.equal(state.completedWeeks, 1);
    assert.equal(state.gameResults.length, 1);
    assert.equal(state.lastAppliedWeekSimId, 'req-1');
    assert.equal(state.phase, 'REGULAR');

    const duplicate = simCurrentWeek.fulfilled(
      { results: [weekResult(0, 'g-dup')], previousRankByTeamId: {} },
      'req-2',
      undefined,
    );
    state = seasonReducer(state, duplicate);
    assert.equal(state.currentWeekIndex, 1);
    assert.equal(state.completedWeeks, 1);
    assert.equal(state.gameResults.length, 1);
    assert.equal(state.gameResults[0]?.id, 'g-0');
    assert.equal(state.lastAppliedWeekSimId, 'req-1');
  });

  test('ignores a fulfill aimed at a week that is not current', () => {
    const stale = simCurrentWeek.fulfilled(
      { results: [weekResult(3)], previousRankByTeamId: {} },
      'req-stale',
      undefined,
    );
    const state = seasonReducer(regularSeason(), stale);
    assert.equal(state.currentWeekIndex, 0);
    assert.equal(state.gameResults.length, 0);
    assert.equal(state.lastAppliedWeekSimId, null);
  });
});

describe('season phase labels', () => {
  test('rail label follows the generated schedule length', () => {
    assert.equal(seasonPhaseRailLabel('REGULAR', 2, 12), 'Week 3 of 12');
    assert.equal(seasonPhaseRailLabel('REGULAR', 0, 10), 'Week 1 of 10');
    assert.equal(seasonPhaseRailLabel('PLAYOFF', 12, 12), 'College Lacrosse Playoff');
  });
});
