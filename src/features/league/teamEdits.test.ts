import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { REHYDRATE } from 'redux-persist';
import { leagueReducer } from './leagueSlice.ts';
import { clearAllTeamOverrides, clearTeamOverride, setTeamOverride, settingsReducer } from '../settings/settingsSlice.ts';

function store() {
  return configureStore({ reducer: combineReducers({ league: leagueReducer, settings: settingsReducer }), middleware: (gdm) => gdm({ serializableCheck: false }) });
}

test('an edit renames the team across the league, is remembered in settings, and can be undone', () => {
  const s = store();
  const original = s.getState().league.teams[5];
  s.dispatch(setTeamOverride({ teamId: original.id, override: { schoolName: 'Ridgeview', colorIndex: 4 } }));
  assert.equal(s.getState().league.teams[5].schoolName, 'Ridgeview');
  assert.equal(s.getState().league.teams[5].colorIndex, 4);
  assert.deepEqual(s.getState().settings.teamOverrides?.[original.id], { schoolName: 'Ridgeview', colorIndex: 4 });
  s.dispatch(clearTeamOverride(original.id));
  assert.equal(s.getState().league.teams[5].schoolName, original.schoolName);
  assert.equal(s.getState().settings.teamOverrides?.[original.id], undefined);
});

test('saved edits come back when the save loads, and restore-all clears them', () => {
  const s = store();
  const team = s.getState().league.teams[9];
  // What redux-persist hands the reducers on load (the league itself is never saved).
  s.dispatch({ type: REHYDRATE, key: 'root', payload: { settings: { teamOverrides: { [team.id]: { nickname: 'Comets' } } } } });
  assert.equal(s.getState().league.teams[9].nickname, 'Comets');
  s.dispatch(setTeamOverride({ teamId: team.id, override: { nickname: 'Comets' } }));
  s.dispatch(clearAllTeamOverrides());
  assert.equal(s.getState().league.teams[9].nickname, team.nickname);
});
