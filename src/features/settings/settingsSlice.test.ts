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
    assert.match(confirmPlayCopy('round', 'Sim the first round'), /first round/);
    assert.doesNotMatch(confirmPlayCopy('round', 'Sim the first round'), /slate/);
  });
});

describe('game reveal and density', () => {
  test('default to instant and comfortable, and remember a choice', async () => {
    const { settingsReducer, setGameReveal, setDensity } = await import('./settingsSlice.ts');
    const initial = settingsReducer(undefined, { type: 'init' });
    assert.equal(initial.gameReveal, 'instant');
    assert.equal(initial.density, 'comfortable');
    const changed = settingsReducer(settingsReducer(initial, setGameReveal('quick')), setDensity('compact'));
    assert.equal(changed.gameReveal, 'quick');
    assert.equal(changed.density, 'compact');
  });

  test('a quick reveal is faster per goal than a full one', async () => {
    const { REVEAL_MS_PER_GOAL } = await import('./settingsSlice.ts');
    assert.ok(REVEAL_MS_PER_GOAL.quick < REVEAL_MS_PER_GOAL.full);
  });
});
