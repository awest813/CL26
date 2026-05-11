import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Team } from '../../types/sim.ts';
import {
  addRecruitToBoard,
  clearRecruitPitch,
  coachReducer,
  initializeRecruitingBoard,
  setRecruitPitch,
} from './coachSlice.ts';

const mockTeams: Team[] = [
  {
    id: 'team-1',
    schoolName: 'North Harbor',
    nickname: 'Anchors',
    conferenceId: 'conf-1',
    region: 'Northeast',
    prestige: 74,
  },
  {
    id: 'team-2',
    schoolName: 'Mesa State',
    nickname: 'Coyotes',
    conferenceId: 'conf-2',
    region: 'West',
    prestige: 61,
  },
];

describe('coach recruiting reducer', () => {
  test('clearing a pitch removes it from the board state', () => {
    let state = coachReducer(undefined, initializeRecruitingBoard({ seed: 2026, teams: mockTeams }));
    const recruitId = state.recruitPool[0]?.id;

    assert.ok(recruitId);

    state = coachReducer(state, addRecruitToBoard({ recruitId, startingInterest: 18 }));
    state = coachReducer(state, setRecruitPitch({ recruitId, pitch: 'PRESTIGE' }));

    assert.strictEqual(state.activePitchesByRecruitId[recruitId], 'PRESTIGE');

    state = coachReducer(state, clearRecruitPitch(recruitId));

    assert.strictEqual(state.activePitchesByRecruitId[recruitId], undefined);
  });

  test('setting a pitch for a non-board recruit is ignored', () => {
    const state = coachReducer(
      undefined,
      setRecruitPitch({ recruitId: 'missing-recruit', pitch: 'ACADEMIC' }),
    );

    assert.deepStrictEqual(state.activePitchesByRecruitId, {});
  });
});
