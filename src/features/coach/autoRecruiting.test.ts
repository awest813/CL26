/**
 * Staff-run recruiting through the real store: one regular season with the
 * toggle on and no manual board work.
 */
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer } from '../season/seasonSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import {
  careerSetupFromPrestige,
  coachReducer,
  completeCareerSetup,
  MAX_HOURS_PER_RECRUIT,
  setAutoRecruiting,
  setCoachProfile,
  WEEKLY_HOURS_CAP,
} from './coachSlice.ts';
import { beginFirstSeason, runAutoRecruiting, runCareerWeeklyCycle, simCareerToBracket } from './careerThunks.ts';

function createStore() {
  return configureStore({
    reducer: combineReducers({
      league: leagueReducer,
      season: seasonReducer,
      coach: coachReducer,
      exhibition: exhibitionReducer,
    }),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
}

describe('staff-run recruiting', () => {
  test('signs a class across a season without board work, inside every cap', async () => {
    const store = createStore();
    const team = [...store.getState().league.teams].sort((a, b) => a.prestige - b.prestige)[64];
    const setup = careerSetupFromPrestige(team.prestige);
    store.dispatch(setCoachProfile({ name: 'Auto Coach', almaMater: 'Test U', archetype: 'TACTICIAN', age: 40, skill: 72 }));
    store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...setup }));
    await store.dispatch(beginFirstSeason({ seed: 2026 }));
    store.dispatch(setAutoRecruiting(true));

    for (let week = 0; week < 12; week += 1) {
      // Preview the plan the weekly cycle will make, then check the caps it holds.
      await store.dispatch(runAutoRecruiting());
      const coach = store.getState().coach;
      const hours = coach.boardRecruitIds.map((id) => coach.weeklyHoursByRecruitId[id] ?? 0);
      assert.ok(hours.reduce((sum, h) => sum + h, 0) <= WEEKLY_HOURS_CAP, `week ${week + 1} over the hours cap`);
      assert.ok(hours.every((h) => h <= MAX_HOURS_PER_RECRUIT), `week ${week + 1} over the per-recruit cap`);
      assert.ok(coach.boardRecruitIds.length <= 25);
      const result = await store.dispatch(runCareerWeeklyCycle());
      assert.strictEqual(result.payload, 'advanced');
    }

    const coach = store.getState().coach;
    const commits = coach.recruitPool.filter((r) => r.committedTeamId === team.id);
    assert.ok(commits.length >= 6, `staff closed only ${commits.length}`);
    assert.ok(commits.length <= coach.scholarshipsAvailable, `${commits.length} commits for ${coach.scholarshipsAvailable} scholarships`);
    assert.ok(
      coach.boardRecruitIds.every((id) => {
        const committedTeamId = coach.recruitPool.find((r) => r.id === id)?.committedTeamId;
        return !committedTeamId || committedTeamId === team.id || coach.recruitingReport?.lostTargets.some((l) => l.recruitId === id);
      }),
      'only targets lost in the final period may linger on the board',
    );
  });

  test('sim to the bracket plays every week and runs recruiting each one', async () => {
    const store = createStore();
    const team = [...store.getState().league.teams].sort((a, b) => a.prestige - b.prestige)[100];
    const setup = careerSetupFromPrestige(team.prestige);
    store.dispatch(setCoachProfile({ name: 'Auto Coach', almaMater: 'Test U', archetype: 'RECRUITER', age: 40, skill: 72 }));
    store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...setup }));
    await store.dispatch(beginFirstSeason({ seed: 77 }));
    store.dispatch(setAutoRecruiting(true));

    const played = await store.dispatch(simCareerToBracket()).unwrap();
    const state = store.getState();
    assert.strictEqual(played, 12);
    assert.strictEqual(state.season.phase, 'PLAYOFF');
    assert.strictEqual(state.coach.recruitingWeekIndex, 12);
    assert.strictEqual(state.coach.recruitingReport?.period, 12);
    const commits = state.coach.recruitPool.filter((r) => r.committedTeamId === team.id).length;
    assert.ok(commits > 0 && commits <= state.coach.scholarshipsAvailable, `${commits} commits`);

    assert.strictEqual(await store.dispatch(simCareerToBracket()).unwrap(), 0, 'nothing left to play');
    const boardBefore = store.getState().coach.boardRecruitIds;
    assert.strictEqual(await store.dispatch(runAutoRecruiting()).unwrap(), false, 'no period left to plan');
    assert.strictEqual(store.getState().coach.boardRecruitIds, boardBefore);
  });
});
