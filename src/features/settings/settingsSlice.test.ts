import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { confirmPlayCopy, setConfirmPlay, setShowWinChance, settingsReducer } from './settingsSlice.ts';

describe('settings', () => {
  test('a new save plays in one click and shows the win chance', () => {
    const state = settingsReducer(undefined, { type: 'init' });
    assert.equal(state.confirmPlay, false);
    assert.equal(state.showWinChance, true);
  });

  test('the two preferences toggle on their own', () => {
    let state = settingsReducer(undefined, { type: 'init' });
    state = settingsReducer(state, setConfirmPlay(true));
    assert.equal(state.confirmPlay, true);
    assert.equal(state.showWinChance, true);
    state = settingsReducer(state, setShowWinChance(false));
    assert.equal(state.confirmPlay, true);
    assert.equal(state.showWinChance, false);
  });

  test('the confirm copy names the week or the round', () => {
    assert.match(confirmPlayCopy('week', 'week 4'), /week 4/);
    assert.match(confirmPlayCopy('week', 'week 4'), /slate/);
    assert.match(confirmPlayCopy('round', 'Sim First round'), /First round/);
    assert.doesNotMatch(confirmPlayCopy('round', 'Sim First round'), /slate/);
  });
});
