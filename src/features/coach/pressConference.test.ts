import assert from 'node:assert';
import { test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer } from '../season/seasonSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import { advanceRecruitingWeek, answerPressConference, careerSetupFromPrestige, coachReducer, completeCareerSetup, setCoachProfile } from './coachSlice.ts';
import { beginFirstSeason, initializeManagedRoster } from './careerThunks.ts';

test('a press answer lands once per game, and its recruiting buzz lasts one recruiting week', async () => {
  const store = configureStore({
    reducer: combineReducers({ league: leagueReducer, season: seasonReducer, coach: coachReducer, exhibition: exhibitionReducer }),
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const team = store.getState().league.teams[30];
  store.dispatch(setCoachProfile({ name: 'P', almaMater: 'U', archetype: 'RECRUITER', age: 40, skill: 72 }));
  store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...careerSetupFromPrestige(team.prestige) }));
  await store.dispatch(initializeManagedRoster());
  await store.dispatch(beginFirstSeason({ seed: 2026 }));

  const before = store.getState().coach.adPressure;
  const bold = { gameKey: '2026-w0-x', tone: 'bold' as const, quote: '"Get used to it."', effectLine: 'Recruiting +6% next week · AD pressure +0.15', effect: { adPressure: 0.15, recruitingBuzz: 1.06, fatigue: 0 } };
  store.dispatch(answerPressConference(bold));
  assert.strictEqual(Math.round((store.getState().coach.adPressure - before) * 100) / 100, 0.15);
  assert.strictEqual(store.getState().coach.pendingRecruitingBuzz, 1.06);

  // A second answer to the same game changes nothing.
  store.dispatch(answerPressConference({ ...bold, tone: 'humble', effect: { adPressure: -5, recruitingBuzz: 1, fatigue: 0 } }));
  assert.strictEqual(store.getState().coach.pressConference?.tone, 'bold');
  assert.strictEqual(Math.round((store.getState().coach.adPressure - before) * 100) / 100, 0.15);

  // The next recruiting week uses the buzz up.
  await store.dispatch(advanceRecruitingWeek());
  assert.strictEqual(store.getState().coach.pendingRecruitingBuzz, 1);
});
