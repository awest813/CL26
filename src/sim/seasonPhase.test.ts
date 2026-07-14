import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCanInitializePlayoffs,
  assertCanSimRegularWeek,
  assertCanSimulatePlayoffRound,
  assertCanSoftResetSeason,
  assertCanStartNewSeason,
  canSoftResetSeason,
  canStartNewSeason,
  careerOffseasonCapabilities,
  nextPhaseForEvent,
  playoffStageFor,
  seasonCapabilities,
} from './seasonPhase.ts';
import type { PlayoffState, SeasonState } from '../types/sim.ts';

function baseSeason(overrides: Partial<SeasonState> = {}): SeasonState {
  return {
    year: 2026,
    currentWeekIndex: 0,
    completedWeeks: 0,
    gameResults: [],
    scheduleByWeek: [[{ id: 'g1', weekIndex: 0, homeTeamId: 'a', awayTeamId: 'b', conferenceGame: false }]],
    isComplete: false,
    phase: 'REGULAR',
    seasonSeed: 1,
    playoffs: null,
    previousRankByTeamId: {},
    ...overrides,
  };
}

const emptyBracket: PlayoffState = {
  seeds: Array.from({ length: 12 }, (_, i) => ({ seed: i + 1, teamId: `t${i + 1}` })),
  rounds: { ROUND1: [], QUARTERFINAL: [], SEMIFINAL: [], FINAL: [] },
  currentRound: 'ROUND1',
  championTeamId: null,
};

describe('seasonPhase state machine', () => {
  test('startNewSeason only from PRE or OFFSEASON', () => {
    assert.equal(canStartNewSeason('PRE'), true);
    assert.equal(canStartNewSeason('OFFSEASON'), true);
    assert.equal(canStartNewSeason('REGULAR'), false);
    assert.equal(canStartNewSeason('PLAYOFF'), false);
    assert.throws(() => assertCanStartNewSeason('REGULAR'), /Cannot start a new season/);
  });

  test('sim week requires REGULAR with remaining schedule', () => {
    assertCanSimRegularWeek(baseSeason());
    assert.throws(() => assertCanSimRegularWeek(baseSeason({ phase: 'PLAYOFF' })), /Cannot simulate/);
    assert.throws(
      () => assertCanSimRegularWeek(baseSeason({ currentWeekIndex: 1 })),
      /Season schedule complete/,
    );
  });

  test('playoff init requires PLAYOFF + finished schedule + null bracket', () => {
    const ready = baseSeason({
      phase: 'PLAYOFF',
      currentWeekIndex: 1,
      completedWeeks: 1,
      playoffs: null,
    });
    assertCanInitializePlayoffs(ready);
    assert.throws(
      () => assertCanInitializePlayoffs({ ...ready, playoffs: emptyBracket }),
      /already been initialized/,
    );
    assert.throws(
      () => assertCanInitializePlayoffs({ ...ready, phase: 'REGULAR' }),
      /Regular season must be complete/,
    );
  });

  test('playoff round sim requires active unfinished bracket', () => {
    assertCanSimulatePlayoffRound(baseSeason({ phase: 'PLAYOFF', playoffs: emptyBracket }));
    assert.throws(
      () => assertCanSimulatePlayoffRound(baseSeason({ phase: 'PLAYOFF', playoffs: null })),
      /No active playoffs/,
    );
    assert.throws(
      () =>
        assertCanSimulatePlayoffRound(
          baseSeason({
            phase: 'PLAYOFF',
            playoffs: { ...emptyBracket, championTeamId: 't1' },
          }),
        ),
      /already complete/,
    );
  });

  test('soft reset blocked in PLAYOFF and OFFSEASON', () => {
    assert.equal(canSoftResetSeason('REGULAR'), true);
    assert.equal(canSoftResetSeason('PLAYOFF'), false);
    assert.throws(() => assertCanSoftResetSeason('OFFSEASON'), /Cannot reset season/);
  });

  test('playoffStageFor distinguishes pending vs active vs complete', () => {
    assert.equal(playoffStageFor('REGULAR', null), 'NONE');
    assert.equal(playoffStageFor('PLAYOFF', null), 'PENDING');
    assert.equal(playoffStageFor('PLAYOFF', emptyBracket), 'ACTIVE');
    assert.equal(
      playoffStageFor('OFFSEASON', { ...emptyBracket, championTeamId: 't1' }),
      'COMPLETE',
    );
  });

  test('seasonCapabilities mirrors guards', () => {
    const caps = seasonCapabilities(
      baseSeason({
        phase: 'PLAYOFF',
        currentWeekIndex: 1,
        completedWeeks: 1,
        playoffs: null,
      }),
    );
    assert.equal(caps.canSimWeek, false);
    assert.equal(caps.canStartPlayoffs, true);
    assert.equal(caps.canSimPlayoffRound, false);
    assert.equal(caps.canResetSeason, false);
  });

  test('nextPhaseForEvent encodes the happy-path table', () => {
    assert.equal(nextPhaseForEvent('PRE', 'BEGIN_SEASON'), 'REGULAR');
    assert.equal(nextPhaseForEvent('REGULAR', 'COMPLETE_REGULAR_SEASON'), 'PLAYOFF');
    assert.equal(nextPhaseForEvent('PLAYOFF', 'INIT_PLAYOFF_BRACKET', { playoffs: null }), 'PLAYOFF');
    assert.equal(
      nextPhaseForEvent('PLAYOFF', 'CROWN_CHAMPION', { playoffs: emptyBracket }),
      'OFFSEASON',
    );
    assert.equal(nextPhaseForEvent('OFFSEASON', 'ADVANCE_NEXT_YEAR'), 'REGULAR');
    assert.equal(nextPhaseForEvent('PLAYOFF', 'RESET_TO_PRE'), null);
    assert.equal(nextPhaseForEvent('REGULAR', 'BEGIN_SEASON'), null);
  });

  test('careerOffseasonCapabilities sequences signing → finalize → advance', () => {
    const base = {
      phase: 'OFFSEASON' as const,
      year: 2026,
      hasSelectedTeam: true,
      hasProgramExpectations: true,
      signedRecruitsByYear: {} as Record<number, unknown>,
      seasonHistory: [] as Array<{ year: number }>,
    };

    let caps = careerOffseasonCapabilities(base);
    assert.equal(caps.canProcessSigningDay, true);
    assert.equal(caps.canFinalizeSeason, false);
    assert.equal(caps.canAdvanceNextYear, false);

    caps = careerOffseasonCapabilities({ ...base, signedRecruitsByYear: { 2026: [] } });
    assert.equal(caps.canProcessSigningDay, false);
    assert.equal(caps.canFinalizeSeason, true);
    assert.equal(caps.canAdvanceNextYear, false);

    caps = careerOffseasonCapabilities({
      ...base,
      signedRecruitsByYear: { 2026: [] },
      seasonHistory: [{ year: 2026 }],
    });
    assert.equal(caps.canFinalizeSeason, false);
    assert.equal(caps.canAdvanceNextYear, true);
  });
});
