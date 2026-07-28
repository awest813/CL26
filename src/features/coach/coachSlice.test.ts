import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Player, Position, Team } from '../../types/sim.ts';
import {
  addRecruitToBoard,
  clearRecruitPitch,
  coachReducer,
  initializeRecruitingBoard,
  setManagedRoster,
  setRecruitPitch,
  setStarterIds,
  toggleStarter,
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

function makePlayer(id: string, position: Position): Player {
  return {
    id,
    name: `Player ${id}`,
    position,
    year: 2,
    age: 19,
    skill: 70,
    shooting: 70,
    passing: 70,
    speed: 70,
    defense: 70,
    IQ: 70,
    stamina: 70,
    discipline: 70,
    overall: 70,
  };
}

const depthChartRoster: Player[] = [
  ...Array.from({ length: 5 }, (_, i) => makePlayer(`a-${i}`, 'A')),
  ...Array.from({ length: 3 }, (_, i) => makePlayer(`g-${i}`, 'G')),
];

describe('depth chart reducer', () => {
  test('promotions stop at the position starter limit', () => {
    let state = coachReducer(undefined, setManagedRoster(depthChartRoster));

    // Attack has three starting slots; the fourth promotion must be refused.
    for (const id of ['a-0', 'a-1', 'a-2', 'a-3']) {
      state = coachReducer(state, toggleStarter(id));
    }

    assert.deepStrictEqual(state.starterIds, ['a-0', 'a-1', 'a-2']);
  });

  test('benching frees a slot for another player at the position', () => {
    let state = coachReducer(undefined, setManagedRoster(depthChartRoster));
    state = coachReducer(state, setStarterIds(['a-0', 'a-1', 'a-2']));

    state = coachReducer(state, toggleStarter('a-1'));
    state = coachReducer(state, toggleStarter('a-3'));

    assert.deepStrictEqual(state.starterIds, ['a-0', 'a-2', 'a-3']);
  });

  test('one goalie starts at a time and unknown players are ignored', () => {
    let state = coachReducer(undefined, setManagedRoster(depthChartRoster));

    state = coachReducer(state, toggleStarter('g-0'));
    state = coachReducer(state, toggleStarter('g-1'));
    state = coachReducer(state, toggleStarter('not-on-roster'));

    assert.deepStrictEqual(state.starterIds, ['g-0']);
  });
});
