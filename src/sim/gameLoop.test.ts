import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlayoffGame, PlayoffState } from '../types/sim.ts';
import { nextLoopStep, userPlayoffSpot } from './gameLoop.ts';

function game(partial: Partial<PlayoffGame> & Pick<PlayoffGame, 'id' | 'round' | 'homeTeamId' | 'awayTeamId'>): PlayoffGame {
  return {
    slot: 0,
    homeSeed: 1,
    awaySeed: 8,
    winnerTeamId: null,
    result: null,
    ...partial,
  };
}

function bracket(partial: Partial<PlayoffState> = {}): PlayoffState {
  return {
    seeds: [{ seed: 2, teamId: 'user' }, { seed: 8, teamId: 'opp' }],
    rounds: { ROUND1: [], QUARTERFINAL: [], SEMIFINAL: [], FINAL: [] },
    currentRound: 'ROUND1',
    championTeamId: null,
    ...partial,
  };
}

describe('user playoff spot', () => {
  test('a top-four seed is on a bye until the quarterfinals', () => {
    const spot = userPlayoffSpot(bracket(), 'user');
    assert.equal(spot.seed, 2);
    assert.equal(spot.bye, true);
    assert.equal(spot.eliminated, false);
    assert.equal(spot.currentGame, null);
  });

  test('an unplayed game is the current spot', () => {
    const spot = userPlayoffSpot(bracket({
      seeds: [{ seed: 8, teamId: 'user' }],
      rounds: {
        ROUND1: [game({ id: 'r1', round: 'ROUND1', homeTeamId: 'user', awayTeamId: 'opp' })],
        QUARTERFINAL: [],
        SEMIFINAL: [],
        FINAL: [],
      },
    }), 'user');
    assert.equal(spot.currentGame?.id, 'r1');
    assert.equal(spot.bye, false);
  });

  test('a loss removes the program from the next round', () => {
    const spot = userPlayoffSpot(bracket({
      currentRound: 'QUARTERFINAL',
      rounds: {
        ROUND1: [game({
          id: 'r1',
          round: 'ROUND1',
          homeTeamId: 'user',
          awayTeamId: 'opp',
          winnerTeamId: 'opp',
          result: {
            id: 'r1',
            weekIndex: 12,
            homeTeamId: 'user',
            awayTeamId: 'opp',
            homeScore: 8,
            awayScore: 11,
            teamStatsHome: {} as never,
            teamStatsAway: {} as never,
          },
        })],
        QUARTERFINAL: [],
        SEMIFINAL: [],
        FINAL: [],
      },
    }), 'user');
    assert.equal(spot.eliminated, true);
    assert.equal(spot.lastGame?.id, 'r1');
    assert.equal(spot.currentGame, null);
  });
});

describe('next loop step', () => {
  const base = {
    phase: 'REGULAR' as const,
    weekNumber: 3,
    canPlayWeek: true,
    canSetBracket: false,
    canPlayRound: false,
    roundLabel: null,
    userPlaying: false,
    userBye: false,
    userEliminated: false,
    userMissedField: false,
    canSign: false,
    canRecordSeason: false,
    canBeginNextYear: false,
  };

  test('a regular week plays from the hub', () => {
    const step = nextLoopStep(base);
    assert.equal(step.action, 'play-week');
    assert.equal(step.button, 'Play week 3');
  });

  test('selection comes before the first playoff round', () => {
    const step = nextLoopStep({ ...base, phase: 'PLAYOFF', canPlayWeek: false, canSetBracket: true });
    assert.equal(step.action, 'set-bracket');
  });

  test('a bye still lets the round play', () => {
    const step = nextLoopStep({
      ...base,
      phase: 'PLAYOFF',
      canPlayWeek: false,
      canPlayRound: true,
      roundLabel: 'First round',
      userBye: true,
    });
    assert.equal(step.action, 'play-round');
    assert.match(step.detail, /bye/);
    assert.equal(step.button, 'Sim First round');
  });

  test('the offseason walks signing day, the record, then next year', () => {
    assert.equal(nextLoopStep({ ...base, phase: 'OFFSEASON', canPlayWeek: false, canSign: true }).action, 'signing-day');
    assert.equal(nextLoopStep({ ...base, phase: 'OFFSEASON', canPlayWeek: false, canRecordSeason: true }).action, 'record-season');
    assert.equal(nextLoopStep({ ...base, phase: 'OFFSEASON', canPlayWeek: false, canBeginNextYear: true }).action, 'begin-next-year');
  });

  test('a firing sends the hub to a landing job', () => {
    const step = nextLoopStep({
      ...base,
      phase: 'OFFSEASON',
      canPlayWeek: false,
      canBeginNextYear: true,
      fired: true,
    });
    assert.equal(step.action, 'take-job');
    assert.match(step.title, /AD let you go/);
    assert.equal(step.button, 'Take a job');
  });
});
