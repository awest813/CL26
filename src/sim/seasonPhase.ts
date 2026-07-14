/**
 * Pure season phase state machine.
 * Thunks/reducers call these helpers so illegal transitions are rejected in one place.
 *
 * Canonical flow:
 *   PRE --BEGIN_SEASON--> REGULAR --COMPLETE_REGULAR--> PLAYOFF(pending)
 *     --INIT_BRACKET--> PLAYOFF(active) --CROWN_CHAMPION--> OFFSEASON
 *     --ADVANCE_NEXT_YEAR--> REGULAR
 *   Any soft-resettable phase --RESET_TO_PRE--> PRE (force bypasses soft lock)
 */
import type { PlayoffState, SeasonState } from '../types/sim';

export type SeasonPhase = SeasonState['phase'];

export type SeasonPhaseEvent =
  | 'BEGIN_SEASON'
  | 'COMPLETE_REGULAR_SEASON'
  | 'INIT_PLAYOFF_BRACKET'
  | 'CROWN_CHAMPION'
  | 'RESET_TO_PRE'
  | 'ADVANCE_NEXT_YEAR';

export type SeasonCapabilities = {
  canBeginSeason: boolean;
  canSimWeek: boolean;
  canStartPlayoffs: boolean;
  canSimPlayoffRound: boolean;
  canResetSeason: boolean;
  /** Season is OFFSEASON; career ceremony gates are checked separately. */
  canAdvanceNextYear: boolean;
};

export type CareerOffseasonCapabilities = {
  canProcessSigningDay: boolean;
  canFinalizeSeason: boolean;
  canAdvanceNextYear: boolean;
};

/** Allowed entry phases for generating a new regular-season schedule. */
export function canStartNewSeason(phase: SeasonPhase): boolean {
  return phase === 'PRE' || phase === 'OFFSEASON';
}

export function canSimRegularWeek(season: Pick<SeasonState, 'phase' | 'scheduleByWeek' | 'currentWeekIndex'>): boolean {
  return (
    season.phase === 'REGULAR' &&
    season.scheduleByWeek.length > 0 &&
    season.currentWeekIndex >= 0 &&
    season.currentWeekIndex < season.scheduleByWeek.length
  );
}

export function canInitializePlayoffs(
  season: Pick<SeasonState, 'phase' | 'playoffs' | 'scheduleByWeek' | 'completedWeeks'>,
): boolean {
  return (
    season.phase === 'PLAYOFF' &&
    season.playoffs == null &&
    season.scheduleByWeek.length > 0 &&
    season.completedWeeks >= season.scheduleByWeek.length
  );
}

export function canSimulatePlayoffRound(
  season: Pick<SeasonState, 'phase' | 'playoffs'>,
): boolean {
  return (
    season.phase === 'PLAYOFF' &&
    season.playoffs != null &&
    !season.playoffs.championTeamId
  );
}

/**
 * Soft reset back to PRE is allowed during active season play.
 * Block during PLAYOFF / OFFSEASON so championship and finalize flows are not wiped casually.
 * Full new-game reset (Home) still uses force: true.
 */
export function canSoftResetSeason(phase: SeasonPhase): boolean {
  return phase === 'PRE' || phase === 'REGULAR';
}

export function hasSigningDayResolved(
  signedRecruitsByYear: Record<number, unknown>,
  year: number,
): boolean {
  return Object.prototype.hasOwnProperty.call(signedRecruitsByYear, year);
}

export function hasSeasonHistoryForYear(
  seasonHistory: Array<{ year: number }>,
  year: number,
): boolean {
  return seasonHistory.some((entry) => entry.year === year);
}

export function careerOffseasonCapabilities(input: {
  phase: SeasonPhase;
  year: number;
  hasSelectedTeam: boolean;
  hasProgramExpectations: boolean;
  signedRecruitsByYear: Record<number, unknown>;
  seasonHistory: Array<{ year: number }>;
}): CareerOffseasonCapabilities {
  const inOffseason = input.phase === 'OFFSEASON' && input.hasSelectedTeam;
  const signingDone = hasSigningDayResolved(input.signedRecruitsByYear, input.year);
  const finalized = hasSeasonHistoryForYear(input.seasonHistory, input.year);

  return {
    canProcessSigningDay: Boolean(inOffseason && !signingDone),
    canFinalizeSeason: Boolean(
      inOffseason && input.hasProgramExpectations && signingDone && !finalized,
    ),
    canAdvanceNextYear: Boolean(inOffseason && signingDone && finalized),
  };
}

export function assertCanStartNewSeason(phase: SeasonPhase): void {
  if (!canStartNewSeason(phase)) {
    throw new Error(
      `Cannot start a new season from phase ${phase}. Expected PRE (first year) or OFFSEASON (next year).`,
    );
  }
}

export function assertCanSimRegularWeek(
  season: Pick<SeasonState, 'phase' | 'scheduleByWeek' | 'currentWeekIndex'>,
): void {
  if (season.phase !== 'REGULAR') {
    throw new Error(`Cannot simulate a regular-season week during phase ${season.phase}.`);
  }
  if (season.scheduleByWeek.length === 0) {
    throw new Error('Cannot simulate a week without a schedule.');
  }
  if (season.currentWeekIndex >= season.scheduleByWeek.length) {
    throw new Error('Season schedule complete');
  }
  if (season.currentWeekIndex < 0) {
    throw new Error(`Current week index (${season.currentWeekIndex}) is invalid.`);
  }
}

export function assertCanInitializePlayoffs(
  season: Pick<SeasonState, 'phase' | 'playoffs' | 'scheduleByWeek' | 'completedWeeks'>,
): void {
  if (season.phase !== 'PLAYOFF') {
    throw new Error('Regular season must be complete before starting playoffs.');
  }
  if (season.playoffs) {
    throw new Error('Playoff bracket has already been initialized.');
  }
  if (
    season.scheduleByWeek.length === 0 ||
    season.completedWeeks < season.scheduleByWeek.length
  ) {
    throw new Error('Cannot start playoffs before the regular season schedule is finished.');
  }
}

export function assertCanSimulatePlayoffRound(
  season: Pick<SeasonState, 'phase' | 'playoffs'>,
): void {
  if (season.phase !== 'PLAYOFF') {
    throw new Error(`Cannot simulate a playoff round during phase ${season.phase}.`);
  }
  if (!season.playoffs) {
    throw new Error('No active playoffs');
  }
  if (season.playoffs.championTeamId) {
    throw new Error('Playoffs already complete.');
  }
}

export function assertCanSoftResetSeason(phase: SeasonPhase): void {
  if (!canSoftResetSeason(phase)) {
    throw new Error(
      `Cannot reset season during ${phase}. Finish the championship / offseason handoff, or start a new game from Home.`,
    );
  }
}

/** Derive UI/capability flags from season + optional playoff pointer. */
export function seasonCapabilities(
  season: Pick<SeasonState, 'phase' | 'scheduleByWeek' | 'currentWeekIndex' | 'completedWeeks' | 'playoffs'>,
): SeasonCapabilities {
  return {
    canBeginSeason: season.phase === 'PRE',
    canSimWeek: canSimRegularWeek(season),
    canStartPlayoffs: canInitializePlayoffs(season),
    canSimPlayoffRound: canSimulatePlayoffRound(season),
    canResetSeason: canSoftResetSeason(season.phase),
    canAdvanceNextYear: season.phase === 'OFFSEASON',
  };
}

/**
 * Playoff sub-stage derived from phase + bracket pointer.
 * Keeps the four-phase enum while making PENDING vs ACTIVE explicit for UI/guards.
 */
export type PlayoffStage = 'NONE' | 'PENDING' | 'ACTIVE' | 'COMPLETE';

export function playoffStageFor(
  phase: SeasonPhase,
  playoffs: PlayoffState | null,
): PlayoffStage {
  if (phase === 'OFFSEASON' && playoffs?.championTeamId) return 'COMPLETE';
  if (phase !== 'PLAYOFF') return 'NONE';
  if (!playoffs) return 'PENDING';
  if (playoffs.championTeamId) return 'COMPLETE';
  return 'ACTIVE';
}

/**
 * Pure phase transition table for documentation and regression.
 * Returns null when the event is illegal from `from` (caller should reject).
 * Bracket pointer is required for playoff sub-stages.
 */
export function nextPhaseForEvent(
  from: SeasonPhase,
  event: SeasonPhaseEvent,
  ctx: { playoffs: PlayoffState | null } = { playoffs: null },
): SeasonPhase | null {
  switch (event) {
    case 'BEGIN_SEASON':
      return from === 'PRE' || from === 'OFFSEASON' ? 'REGULAR' : null;
    case 'COMPLETE_REGULAR_SEASON':
      return from === 'REGULAR' ? 'PLAYOFF' : null;
    case 'INIT_PLAYOFF_BRACKET':
      return from === 'PLAYOFF' && ctx.playoffs == null ? 'PLAYOFF' : null;
    case 'CROWN_CHAMPION':
      return from === 'PLAYOFF' && ctx.playoffs != null && !ctx.playoffs.championTeamId
        ? 'OFFSEASON'
        : null;
    case 'RESET_TO_PRE':
      return canSoftResetSeason(from) ? 'PRE' : null;
    case 'ADVANCE_NEXT_YEAR':
      return from === 'OFFSEASON' ? 'REGULAR' : null;
    default:
      return null;
  }
}
