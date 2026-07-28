/**
 * Season slice state-machine guards: week application, loop termination, and
 * rejection of stale/duplicate results.
 */
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { coachReducer } from '../coach/coachSlice.ts';
import { uiReducer } from '../ui/uiSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import { beginFirstSeason } from '../coach/careerThunks.ts';
import { seasonReducer, simCurrentWeek, simSeason, startNewSeason } from './seasonSlice.ts';
import type { SeasonState } from '../../types/sim.ts';

const REGULAR_WEEKS = 12;

function createStore() {
  return configureStore({
    reducer: combineReducers({
      league: leagueReducer,
      season: seasonReducer,
      coach: coachReducer,
      ui: uiReducer,
      exhibition: exhibitionReducer,
    }),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
}

describe('season week progression', () => {
  test('simSeason plays out the regular season and stops at the playoff gate', async () => {
    const store = createStore();
    await store.dispatch(beginFirstSeason({ seed: 2026 }));

    await store.dispatch(simSeason());

    const season = store.getState().season;
    assert.strictEqual(season.completedWeeks, REGULAR_WEEKS);
    assert.strictEqual(season.currentWeekIndex, REGULAR_WEEKS);
    assert.strictEqual(season.phase, 'PLAYOFF');
    assert.strictEqual(season.gameResults.length, REGULAR_WEEKS * 64);
  });

  test('simSeason terminates instead of spinning when the season cannot advance', async () => {
    const store = createStore();

    // PRE with no schedule: every week sim is illegal, so the loop must exit immediately.
    await store.dispatch(simSeason());
    assert.strictEqual(store.getState().season.phase, 'PRE');
    assert.strictEqual(store.getState().season.completedWeeks, 0);

    // And again once the bracket gate is reached — no schedule weeks are left to run.
    await store.dispatch(beginFirstSeason({ seed: 2026 }));
    await store.dispatch(simSeason());
    await store.dispatch(simSeason());

    const season = store.getState().season;
    assert.strictEqual(season.phase, 'PLAYOFF');
    assert.strictEqual(season.completedWeeks, REGULAR_WEEKS);
    assert.strictEqual(season.gameResults.length, REGULAR_WEEKS * 64);
  });

  test('a single week advances exactly one week of results', async () => {
    const store = createStore();
    await store.dispatch(startNewSeason({ seed: 4242 }));
    await store.dispatch(simCurrentWeek());

    const season = store.getState().season;
    assert.strictEqual(season.currentWeekIndex, 1);
    assert.strictEqual(season.completedWeeks, 1);
    assert.strictEqual(season.gameResults.length, 64);
    assert.ok(season.gameResults.every((result) => result.weekIndex === 0));
  });

  test('week results for a week we are no longer on are rejected', async () => {
    const store = createStore();
    await store.dispatch(startNewSeason({ seed: 4242 }));
    await store.dispatch(simCurrentWeek());

    const before = store.getState().season;
    const staleResults = before.gameResults.slice(0, 4);

    // Replaying week 0's fulfilled action while the season sits on week 1 would
    // otherwise double-append results and skip a week of the schedule.
    const after: SeasonState = seasonReducer(before, {
      type: simCurrentWeek.fulfilled.type,
      payload: { results: staleResults, previousRankByTeamId: {}, weekIndex: 0 },
    });

    assert.deepStrictEqual(after, before);
  });
});
