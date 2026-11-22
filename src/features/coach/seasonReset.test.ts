import assert from 'node:assert';
import { test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { leagueReducer } from '../league/leagueSlice.ts';
import { seasonReducer, resetSeason } from '../season/seasonSlice.ts';
import { coachReducer, setCoachProfile, completeCareerSetup, careerSetupFromPrestige } from './coachSlice.ts';
import { exhibitionReducer } from '../exhibition/exhibitionSlice.ts';
import { beginFirstSeason, runCareerWeeklyCycle, initializeManagedRoster } from './careerThunks.ts';

test('a reset season restores the roster it began with', async () => {
  const store = configureStore({
    reducer: combineReducers({ league: leagueReducer, season: seasonReducer, coach: coachReducer, exhibition: exhibitionReducer }),
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
  const team = store.getState().league.teams[20];
  store.dispatch(setCoachProfile({ name: 'R', almaMater: 'U', archetype: 'DEVELOPER', age: 40, skill: 72 }));
  store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...careerSetupFromPrestige(team.prestige) }));
  await store.dispatch(initializeManagedRoster());
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  const start = JSON.stringify(store.getState().coach.managedRoster);
  for (let week = 0; week < 4; week += 1) await store.dispatch(runCareerWeeklyCycle());
  assert.notStrictEqual(JSON.stringify(store.getState().coach.managedRoster), start, 'weekly growth changed the roster');
  store.dispatch(resetSeason({ preserveYear: true }));
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  assert.strictEqual(JSON.stringify(store.getState().coach.managedRoster), start);
});

test('a reset season restores the coach progression it began with, so weeks cannot be replayed for XP', async () => {
  const store = configureStore({
    reducer: combineReducers({ league: leagueReducer, season: seasonReducer, coach: coachReducer, exhibition: exhibitionReducer }),
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
  const team = store.getState().league.teams[20];
  store.dispatch(setCoachProfile({ name: 'R', almaMater: 'U', archetype: 'DEVELOPER', age: 40, skill: 72 }));
  store.dispatch(completeCareerSetup({ teamId: team.id, seasonYear: 1, ...careerSetupFromPrestige(team.prestige) }));
  await store.dispatch(initializeManagedRoster());
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  const pick = (c: ReturnType<typeof store.getState>['coach']) => JSON.stringify({
    xp: c.coachXp, level: c.coachLevel, points: c.coachSkillPoints, tree: c.skillTree,
    fatigue: c.teamFatigue, pressure: c.adPressure, security: c.jobSecurity,
  });
  const start = pick(store.getState().coach);
  for (let week = 0; week < 11; week += 1) await store.dispatch(runCareerWeeklyCycle());
  assert.notStrictEqual(pick(store.getState().coach), start, 'playing weeks moved the coach');
  store.dispatch(resetSeason({ preserveYear: true }));
  await store.dispatch(beginFirstSeason({ seed: 2026 }));
  assert.strictEqual(pick(store.getState().coach), start);
});
