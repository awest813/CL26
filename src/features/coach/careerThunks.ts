import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../../store/store';
import { simCurrentWeek, selectTeamRecords, simNextPlayoffRound } from '../season/seasonSlice';
import {
  advanceCoachWeek,
  advanceRecruitingWeek,
  applyAutoRecruitingPlan,
  addCoachXp,
  setAdPressure,
  updateJobSecurity,
  recordSeasonEnd,
  resetRecruitingForNewSeason,
  setManagedRoster,
  setStarterIds,
  applyPrestigeDrift,
  setPendingJobOffers,
  setAssistants,
  setStaffDepartures,
  setJobOpenings,
  setSeasonStartRoster,
  setEmployment,
  initializeRecruitingBoard,
  updateProgramStanding,
  careerSetupFromPrestige,
  tierAdPressure,
  applyPlayoffRoundFatigue,
  clearOffseasonMarket,
  MAX_HOURS_PER_RECRUIT,
  programRecruitingBonus,
  WEEKLY_HOURS_CAP,
} from './coachSlice';
import { planAutoRecruiting } from '../../sim/autoRecruit';
import { userPlayoffRun } from '../../sim/gameLoop';
import { buildPositionNeedByPosition } from '../../sim/recruiting';
import { coachSkillMultiplier, lateSigningSweep } from '../../sim/recruitingWeek';
import type { GameResult } from '../../types/sim';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { applyRosterTurnover, applyWeeklyTraitGrowth, buildDefaultStarters } from '../../sim/rosterManagement';
import {
  buildPortalBoard,
  buildProDraft,
  entrantToPlayer,
} from '../../sim/offseasonMarket';
import { computePollInputs, computeRankings } from '../../sim/rankings';
import { advanceProgramLedger, draftLedger, nextPrestigeDrift, prestigeDriftForSeason, programRoster, reachedSemifinal, withLeaguePrestige } from '../../sim/programLedger';
import { leaguePrestiges } from '../../sim/programExpectations';
import { buildSeasonJobMarket, FIRED_JOB_SECURITY, programOpenings } from '../../sim/jobOffers';
import { advanceStaff, generateStaff } from '../../sim/assistants';
import {
  canSimRegularWeek,
  careerOffseasonCapabilities,
  hasSeasonHistoryForYear,
} from '../../sim/seasonPhase';
import { applyProgramLedger, simConferenceChampionships, startNewSeason } from '../season/seasonSlice';
import { tournamentRunFor } from '../../sim/conferenceTournaments';

const BASE_WEEKLY_XP = 8;
const WINNING_WEEK_XP_BONUS = 3;
const WIN_GAP_PRESSURE_MULTIPLIER = 2;
const RANK_GAP_PRESSURE_DIVISOR = 6;
const DEFAULT_AD_PRESSURE = 45;
const FACILITY_PRESSURE_RELIEF_BASELINE = 50;
const FACILITY_PRESSURE_RELIEF_DIVISOR = 6;
const SECURITY_PENALTY_NEUTRAL_PRESSURE = 50;
const SECURITY_PENALTY_DIVISOR = 6;
const AD_PRESSURE_SETTLE_RATE = 0.25;
const PLAYOFF_PRESSURE_RELIEF = 4;
const CHAMPION_PRESSURE_RELIEF = 10;
const CONTENDER_MISSED_FIELD_PENALTY = 4;
/** Security for a win-now program's bracket run short of a title: an early exit barely counts. */
const CONTENDER_EARLY_EXIT_SECURITY = 3;
const CONTENDER_FINAL_FOUR_SECURITY = 10;
const CONTENDER_FINAL_SECURITY = 16;
const REBUILD_WINNING_RECORD_BONUS = 5;
const TOTAL_TEAMS = 128;

export function userWonResult(result: GameResult | undefined, teamId: string | null | undefined): boolean {
  if (!result || !teamId) return false;
  if (result.teamAId === teamId) return result.scoreA > result.scoreB;
  if (result.teamBId === teamId) return result.scoreB > result.scoreA;
  return false;
}

export function computeWeeklyCoachXp(wonThisWeek: boolean, operationsSkill: number): number {
  return BASE_WEEKLY_XP + (wonThisWeek ? WINNING_WEEK_XP_BONUS : 0) + Math.max(0, operationsSkill);
}

/**
 * Have the staff set the board, hours, and pitches for the next recruiting period.
 * Returns false when there is no class or no period left to plan.
 */
export const runAutoRecruiting = createAsyncThunk<boolean, void, { state: RootState }>(
  'coach/runAutoRecruiting',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const coach = state.coach;
    const baseTeam = state.league.teams.find((t) => t.id === coach.selectedTeamId);
    if (!baseTeam || coach.recruitPool.length === 0) return false;

    // One recruiting period runs with each regular-season week. The last one runs
    // after the final game, so count periods rather than checking the phase.
    const periodsLeft = state.season.scheduleByWeek.length - coach.recruitingWeekIndex;
    if (periodsLeft <= 0) return false;

    const team = {
      ...baseTeam,
      prestige: Math.max(1, Math.min(100, baseTeam.prestige + (coach.programPrestigeDrift ?? 0))),
    };
    const plan = planAutoRecruiting({
      recruitPool: coach.recruitPool,
      boardRecruitIds: coach.boardRecruitIds,
      team,
      positionNeedByPosition: buildPositionNeedByPosition(coach.managedRoster),
      classNeedByPosition: buildPositionNeedByPosition(
        coach.managedRoster?.filter((player) => player.year < 4) ?? null,
      ),
      scholarshipsAvailable: coach.scholarshipsAvailable,
      periodsLeft,
      hoursCap: WEEKLY_HOURS_CAP,
      maxHoursPerRecruit: MAX_HOURS_PER_RECRUIT,
      gainMultiplier: programRecruitingBonus(coach) * coachSkillMultiplier(coach.profile?.skill ?? 72),
    });
    dispatch(applyAutoRecruitingPlan(plan));
    return true;
  },
);

export const runCareerWeeklyCycle = createAsyncThunk<'advanced' | 'skipped', void, { state: RootState }>(
  'coach/runCareerWeeklyCycle',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const season = state.season;
    const coach = state.coach;

    const canAdvanceRecruiting = coach.recruitPool.length > 0 && Boolean(coach.selectedTeamId);
    if (!canSimRegularWeek(season)) {
      return 'skipped';
    }
    // Saves from before assistants existed get the program's staff before the first game.
    const staffTeam = state.league.teams.find((team) => team.id === coach.selectedTeamId);
    if (!coach.assistants && staffTeam) dispatch(setAssistants(generateStaff(staffTeam, 'staff')));
    // Offers expire when the new season starts.
    if (coach.pendingJobOffers.length > 0 && coach.pendingJobOffers.every((offer) => offer.presentedAtYear < season.year)) {
      dispatch(setPendingJobOffers([]));
    }

    const simAction = await dispatch(simCurrentWeek());
    if (!simCurrentWeek.fulfilled.match(simAction)) {
      return 'skipped';
    }

    const postSimState = getState();
    // A duplicate in-flight sim is ignored by the reducer. Only the request that
    // actually advanced the week should move recruiting and award XP.
    if (postSimState.season.lastAppliedWeekSimId !== simAction.meta.requestId) {
      return 'skipped';
    }

    // Recruiting updates are optional; season progression should still work even if
    // the user has no active targets on their board.
    if (canAdvanceRecruiting) {
      if (getState().coach.autoRecruiting) {
        await dispatch(runAutoRecruiting());
      }
      await dispatch(advanceRecruitingWeek());
    }

    const postWeekState = getState();
    const postWeekCoach = postWeekState.coach;
    const postWeekSeason = postWeekState.season;
    const lastWeek = postWeekSeason.currentWeekIndex - 1;
    const userGame = postWeekCoach.selectedTeamId
      ? postWeekSeason.gameResults.find(
          (game) =>
            game.weekIndex === lastWeek &&
            (game.teamAId === postWeekCoach.selectedTeamId || game.teamBId === postWeekCoach.selectedTeamId),
        )
      : undefined;
    const weeklyXp = computeWeeklyCoachXp(
      userWonResult(userGame, postWeekCoach.selectedTeamId),
      postWeekCoach.skillTree?.operations ?? 0,
    );
    dispatch(addCoachXp(weeklyXp));

    if (postWeekCoach.selectedTeamId && postWeekCoach.managedRoster) {
      const grownRoster = applyWeeklyTraitGrowth(
        postWeekCoach.managedRoster,
        postWeekSeason.seasonSeed,
        postWeekSeason.completedWeeks,
        postWeekCoach.practiceFocus,
        {
          coachArchetype: postWeekCoach.profile?.archetype,
          coachSkill: postWeekCoach.profile?.skill ?? 70,
          developmentSkill: postWeekCoach.skillTree?.development ?? 0,
          operationsSkill: postWeekCoach.skillTree?.operations ?? 0,
          facilitiesLevel: postWeekCoach.programResources?.facilities ?? 50,
          boostersLevel: postWeekCoach.programResources?.boosters ?? 50,
        },
      );
      dispatch(setManagedRoster(grownRoster));
    }

    dispatch(advanceCoachWeek());
    return 'advanced';
  },
);

/**
 * Play every remaining regular-season week through the full career cycle, so
 * recruiting, XP, and development move exactly as they do one week at a time.
 * Stops early if a week does not advance. Returns the weeks played.
 */
export const simCareerToBracket = createAsyncThunk<number, void, { state: RootState }>(
  'coach/simCareerToBracket',
  async (_arg, { dispatch, getState }) => {
    let played = 0;
    while (canSimRegularWeek(getState().season)) {
      const outcome = await dispatch(runCareerWeeklyCycle()).unwrap();
      if (outcome !== 'advanced') break;
      played += 1;
    }
    return played;
  },
);

export const processSeasonEnd = createAsyncThunk<void, void, { state: RootState }>(
  'coach/processSeasonEnd',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const coach = state.coach;
    const season = state.season;

    if (season.phase !== 'OFFSEASON') return;
    if (!coach.selectedTeamId || !coach.programExpectations) return;

    const ceremony = careerOffseasonCapabilities({
      phase: season.phase,
      year: season.year,
      hasSelectedTeam: Boolean(coach.selectedTeamId),
      hasProgramExpectations: Boolean(coach.programExpectations),
      signedRecruitsByYear: coach.signedRecruitsByYear,
      seasonHistory: coach.seasonHistory,
    });
    if (!ceremony.canFinalizeSeason) return;

    const records = selectTeamRecords(state);
    const teams = state.league.teams;
    const userRecord = records[coach.selectedTeamId] ?? { wins: 0, losses: 0 };
    const wins = userRecord.wins;
    const losses = userRecord.losses;

    const pollInputs = computePollInputs(season.gameResults, records);
    const leagueTeams = withLeaguePrestige(teams, season.programLedger, coach.selectedTeamId, coach.programPrestigeDrift ?? 0);
    const rankingsTable = computeRankings(leagueTeams, records, 128, pollInputs);
    const userPollRow = rankingsTable.find((r) => r.teamId === coach.selectedTeamId);
    const pollRank = userPollRow?.rank ?? TOTAL_TEAMS;
    const rankTarget = coach.programExpectations.rankTarget;

    // Determine playoff outcomes
    const playoffSeeds = season.playoffs?.seeds ?? [];
    const madePlayoffs = playoffSeeds.some((s) => s.teamId === coach.selectedTeamId);
    const champion = season.playoffs?.championTeamId === coach.selectedTeamId;
    const playoffRun = userPlayoffRun(season.playoffs ?? null, coach.selectedTeamId);
    const finalFour = reachedSemifinal(season.playoffs, coach.selectedTeamId);
    const winNow = coach.careerTier === 'CONTENDER';

    // Job security delta: compare actual wins to win target
    const winDiff = wins - coach.programExpectations.winTarget;
    let securityDelta: number;
    if (champion) {
      securityDelta = 25;
    } else if (madePlayoffs && winNow) {
      securityDelta = playoffRun.lastRound === 'FINAL'
        ? CONTENDER_FINAL_SECURITY
        : finalFour ? CONTENDER_FINAL_FOUR_SECURITY : CONTENDER_EARLY_EXIT_SECURITY;
    } else if (madePlayoffs) {
      securityDelta = 10;
    } else if (winDiff >= 2) {
      securityDelta = 12;
    } else if (winDiff >= 0) {
      securityDelta = 4;
    } else if (winDiff >= -1) {
      // One game short is a disappointment, not a crisis.
      securityDelta = -5;
    } else if (winDiff >= -2) {
      securityDelta = -10;
    } else {
      securityDelta = -22;
    }

    // Each situation has its own bar: a win-now AD wants the bracket, a rebuild AD a winning record.
    if (winNow && !madePlayoffs) securityDelta -= CONTENDER_MISSED_FIELD_PENALTY;
    if (coach.careerTier === 'REBUILD' && wins > losses) securityDelta += REBUILD_WINNING_RECORD_BONUS;

    const gamesPlayed = wins + losses;
    if (gamesPlayed >= 8 && pollRank <= rankTarget) {
      securityDelta += 5;
    }
    // A poor poll finish only stings when the wins fell short too.
    if (gamesPlayed >= 8 && pollRank > rankTarget + 10 && !madePlayoffs && winDiff < 0) {
      securityDelta -= 8;
    }

    const winExpectationGap = Math.max(0, coach.programExpectations.winTarget - wins);
    const winSurplus = Math.max(0, wins - coach.programExpectations.winTarget);
    const rankExpectationGap = Math.max(0, pollRank - rankTarget);
    // Pressure settles a quarter of the way back toward the program's norm each year, so it
    // cannot only ratchet up; missed targets push it up and good seasons ease it.
    const priorPressure = coach.adPressure ?? DEFAULT_AD_PRESSURE;
    const settledPressure = priorPressure + (tierAdPressure(coach.careerTier) - priorPressure) * AD_PRESSURE_SETTLE_RATE;
    const baseAdPressure =
      settledPressure +
      winExpectationGap * WIN_GAP_PRESSURE_MULTIPLIER +
      Math.floor(rankExpectationGap / RANK_GAP_PRESSURE_DIVISOR) -
      winSurplus * WIN_GAP_PRESSURE_MULTIPLIER -
      // A win-now AD is only eased by a final-four run.
      (champion ? CHAMPION_PRESSURE_RELIEF : madePlayoffs && (!winNow || finalFour) ? PLAYOFF_PRESSURE_RELIEF : 0);
    const resourceShield = Math.round(
      ((coach.programResources?.facilities ?? FACILITY_PRESSURE_RELIEF_BASELINE) - FACILITY_PRESSURE_RELIEF_BASELINE) /
        FACILITY_PRESSURE_RELIEF_DIVISOR,
    );
    const boostedPressure = Math.max(0, Math.min(100, baseAdPressure - resourceShield));
    const pressurePenalty = Math.round(
      (boostedPressure - SECURITY_PENALTY_NEUTRAL_PRESSURE) / SECURITY_PENALTY_DIVISOR,
    );

    // Hitting the AD's win target always saves the job for another year.
    const securityFloor = winDiff >= 0 ? FIRED_JOB_SECURITY : 0;
    const newJobSecurity = Math.max(securityFloor, Math.min(100, coach.jobSecurity + securityDelta - pressurePenalty));
    const prestigeDriftDelta = prestigeDriftForSeason(champion, madePlayoffs, winDiff, coach.careerTier ?? undefined, finalFour);
    const currentTeam = teams.find((team) => team.id === coach.selectedTeamId);
    const currentEffectivePrestige = Math.max(
      1,
      Math.min(100, (currentTeam?.prestige ?? 50) + nextPrestigeDrift(coach.programPrestigeDrift ?? 0, prestigeDriftDelta)),
    );

    // Signing class stats
    const signedClass = coach.signedRecruitsByYear[season.year] ?? [];
    const avgRecruitStars =
      signedClass.length > 0
        ? signedClass.reduce((sum, s) => sum + s.stars, 0) / signedClass.length
        : 0;

    dispatch(recordSeasonEnd({
      year: season.year,
      teamId: coach.selectedTeamId,
      winTarget: coach.programExpectations.winTarget,
      rankTarget,
      pollRank,
      wins,
      losses,
      madePlayoffs,
      champion,
      playoffWins: playoffRun.wins,
      playoffLosses: playoffRun.losses,
      playoffRound: playoffRun.lastRound,
      recruitsSigned: signedClass.length,
      avgRecruitStars: Math.round(avgRecruitStars * 100) / 100,
      jobSecurityEnd: newJobSecurity,
      prestigeEnd: currentEffectivePrestige,
    }));

    dispatch(setAdPressure(Math.round(boostedPressure * 10) / 10));
    dispatch(updateJobSecurity(newJobSecurity));
    dispatch(applyPrestigeDrift(prestigeDriftDelta));

    // The rest of the league: results move each CPU program's prestige, and the class it
    // signed and the players it lost early to the pros move its talent. Read the CPU
    // classes before the recruit pool is cleared for next year.
    // Prospects still uncommitted sign late with CPU programs, so every program brings in a class.
    const lateSignings = lateSigningSweep(coach.recruitPool, coach.selectedTeamId, teams);
    const classStarsByTeamId: Record<string, number[]> = {};
    for (const recruit of coach.recruitPool) {
      const teamId = recruit.committedTeamId ?? lateSignings[recruit.id];
      if (!teamId || teamId === coach.selectedTeamId) continue;
      (classStarsByTeamId[teamId] ??= []).push(recruit.stars);
    }
    const earlyEntrantsByTeamId: Record<string, number> = {};
    for (const pick of buildProDraft({
      teams,
      rosterSeed: leagueSeasonRosterSeed(season.seasonSeed),
      seasonSeed: season.seasonSeed,
      year: season.year,
      userTeamId: coach.selectedTeamId,
      userRoster: coach.managedRoster,
      ledger: season.programLedger,
    })) {
      if (pick.early && pick.collegeId !== coach.selectedTeamId) {
        earlyEntrantsByTeamId[pick.collegeId] = (earlyEntrantsByTeamId[pick.collegeId] ?? 0) + 1;
      }
    }
    dispatch(applyProgramLedger({
      year: season.year,
      ledger: advanceProgramLedger({
        ledger: season.programLedger,
        teams,
        recordsByTeamId: records,
        playoffs: season.playoffs,
        classStarsByTeamId,
        earlyEntrantsByTeamId,
        userTeamId: coach.selectedTeamId,
        year: season.year,
      }),
    }));

    // Offers read prestige after this season is on the ledger, the same numbers accepting a job uses.
    const updated = getState();
    const marketTeams = withLeaguePrestige(teams, updated.season.programLedger, coach.selectedTeamId, updated.coach.programPrestigeDrift ?? 0);
    // Raise or lower program expectations as prestige drifts, ranked in the league as it now stands.
    dispatch(updateProgramStanding(careerSetupFromPrestige(currentEffectivePrestige, leaguePrestiges(marketTeams))));
    // Head-coaching jobs open where CPU staffs missed badly; offers and poached assistants both come from them.
    // Judged against where each program stood going into the season, as the ledger judged it.
    const openings = programOpenings({
      teams: leagueTeams,
      records,
      seasonSeed: season.seasonSeed,
      year: season.year,
      userTeamId: coach.selectedTeamId,
    });
    const market = buildSeasonJobMarket({
      teams: marketTeams,
      userTeamId: coach.selectedTeamId,
      seasonSeed: season.seasonSeed,
      year: season.year,
      jobSecurity: newJobSecurity,
      champion,
      madePlayoffs,
      wins,
      winTarget: coach.programExpectations.winTarget,
      effectivePrestige: currentEffectivePrestige,
      openings,
    });
    dispatch(setPendingJobOffers(market.offers));
    dispatch(setEmployment(market.employment));

    // The staff's offseason: a year older, some better, the best hired away, the oldest retired.
    const staffYear = advanceStaff({
      staff: updated.coach.assistants ?? generateStaff(currentTeam ?? marketTeams[0], 'staff'),
      seed: season.seasonSeed,
      year: season.year,
      madePlayoffs,
      // A job that called the head coach is his to take or leave, not his assistant's.
      openings: marketTeams.filter((team) => openings.has(team.id) && !market.offers.some((offer) => offer.teamId === team.id)),
    });
    // A seat an assistant took is filled.
    const filled = new Set(staffYear.departures.map((departure) => departure.teamId).filter(Boolean));
    dispatch(setJobOpenings([...openings].filter((teamId) => !filled.has(teamId)).sort()));
    dispatch(setAssistants(staffYear.staff));
    dispatch(setStaffDepartures(staffYear.departures));

    dispatch(resetRecruitingForNewSeason());
  },
);

/**
 * Initialize the managed roster from the procedurally generated one.
 * Called at career start or when no managed roster exists yet.
 */
export const initializeManagedRoster = createAsyncThunk<void, void, { state: RootState }>(
  'coach/initializeManagedRoster',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const coach = state.coach;
    const teams = state.league.teams;

    if (!coach.selectedTeamId) return;
    const team = teams.find((t) => t.id === coach.selectedTeamId);
    if (!team) return;

    // The program as the coach finds it: its current standing in the league. Copied, since the CPU roster is shared.
    const rosterSeed = leagueSeasonRosterSeed(state.season.seasonSeed);
    const roster = programRoster(team, state.season.programLedger, rosterSeed).map((player) => ({ ...player }));
    const starters = buildDefaultStarters(roster);
    dispatch(setManagedRoster(roster));
    dispatch(setStarterIds(starters));
  },
);

/**
 * Apply offseason roster turnover: graduates leave, recruits join, players develop.
 * Called when beginning a new season.
 */
export const applyOffseasonRosterTurnover = createAsyncThunk<void, { newSeed: number }, { state: RootState }>(
  'coach/applyOffseasonRosterTurnover',
  async ({ newSeed }, { dispatch, getState }) => {
    const state = getState();
    const coach = state.coach;
    const teams = state.league.teams;

    if (!coach.selectedTeamId) return;
    const team = teams.find((t) => t.id === coach.selectedTeamId);
    if (!team) return;

    // Get current roster (fall back to procedural if no managed roster yet)
    const rosterSeed = leagueSeasonRosterSeed(state.season.seasonSeed);
    const currentRoster = coach.managedRoster ?? generateRoster(team, rosterSeed);

    // Only apply this offseason's signing class; prior years stay archived in history and are not re-applied.
    const signedRecruits = coach.signedRecruitsByYear[state.season.year] ?? [];
    const room = Math.max(0, coach.scholarshipsAvailable ?? 0);
    const portalClaims = new Set(coach.portalClaimIds ?? []);
    // Built from the same team list the offseason market shows, so a claimed transfer arrives as listed.
    const portalPlayers = buildPortalBoard(teams, team.id, newSeed, state.season.year)
      .filter((entrant) => portalClaims.has(entrant.id))
      .slice(0, Math.min(3, room))
      .map(entrantToPlayer);
    const earlyProIds = buildProDraft({
      teams,
      rosterSeed,
      seasonSeed: state.season.seasonSeed,
      year: state.season.year,
      userTeamId: team.id,
      userRoster: currentRoster,
      ledger: draftLedger(state.season),
    })
      .filter((pick) => pick.early && pick.collegeId === team.id)
      .map((pick) => pick.playerId);

    const newRoster = applyRosterTurnover(currentRoster, signedRecruits, team, newSeed, {
      coachArchetype: coach.profile?.archetype,
      developmentSkill: coach.skillTree?.development ?? 0,
      operationsSkill: coach.skillTree?.operations ?? 0,
      facilitiesLevel: coach.programResources?.facilities ?? 50,
      boostersLevel: coach.programResources?.boosters ?? 50,
      perks: coach.coachPerks,
    }, portalPlayers, earlyProIds);
    dispatch(clearOffseasonMarket());
    const newStarters = buildDefaultStarters(newRoster);
    dispatch(setManagedRoster(newRoster));
    dispatch(setStarterIds(newStarters));
  },
);

/**
 * Offseason → next regular season handoff used by Career Office and regression harness.
 * Requires signing day + season finalize to already be complete for the current year.
 */
export const beginNextCareerSeason = createAsyncThunk<number | null, void, { state: RootState }>(
  'coach/beginNextCareerSeason',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const { season, coach, league } = state;

    if (season.phase !== 'OFFSEASON') return null;
    if (!coach.selectedTeamId) return null;
    if ((coach.employment ?? 'ACTIVE') === 'FIRED') return null;

    const ceremony = careerOffseasonCapabilities({
      phase: season.phase,
      year: season.year,
      hasSelectedTeam: Boolean(coach.selectedTeamId),
      hasProgramExpectations: Boolean(coach.programExpectations),
      signedRecruitsByYear: coach.signedRecruitsByYear,
      seasonHistory: coach.seasonHistory,
    });
    if (!ceremony.canAdvanceNextYear) return null;

    const nextSeed = season.seasonSeed + 1;
    await dispatch(applyOffseasonRosterTurnover({ newSeed: nextSeed }));
    await dispatch(startNewSeason({ seed: nextSeed })).unwrap();

    const after = getState();
    // The season's starting roster, kept so a reset can restore it.
    dispatch(setSeasonStartRoster({ year: after.season.year, roster: after.coach.managedRoster ?? [], starterIds: after.coach.starterIds }));
    const recruitingTeams = withLeaguePrestige(
      league.teams,
      after.season.programLedger,
      coach.selectedTeamId,
      after.coach.programPrestigeDrift ?? 0,
    );
    dispatch(initializeRecruitingBoard({ seed: nextSeed, teams: recruitingTeams }));
    return nextSeed;
  },
);

/**
 * PRE → REGULAR handoff for the first (or soft-reset) season.
 * Generates the schedule, sets the roster (drawn at the season seed for a new career, restored
 * from the season's start after a reset), and opens recruiting.
 */
export const beginFirstSeason = createAsyncThunk<number, { seed: number }, { state: RootState }>(
  'coach/beginFirstSeason',
  async ({ seed }, { dispatch, getState }) => {
    const state = getState();
    if (state.season.phase !== 'PRE') {
      throw new Error('beginFirstSeason only runs from preseason.');
    }
    if (hasSeasonHistoryForYear(state.coach.seasonHistory, state.season.year)) {
      throw new Error(
        `Year ${state.season.year} is already in career history. Finish the offseason handoff or start a new game from Home.`,
      );
    }

    await dispatch(startNewSeason({ seed })).unwrap();

    const after = getState();
    if (after.coach.selectedTeamId && after.coach.onboardingStep === 'READY') {
      const snapshot = after.coach.seasonStartRoster;
      if (snapshot && snapshot.year === after.season.year) {
        // A reset season starts from the roster it began with, so weekly growth is not applied twice.
        dispatch(setManagedRoster(snapshot.roster));
        dispatch(setStarterIds(snapshot.starterIds));
      } else if (after.coach.seasonHistory.length === 0 || !after.coach.managedRoster?.length) {
        // A new career draws its roster at the season seed the coach picked.
        await dispatch(initializeManagedRoster());
      }
      const started = getState().coach;
      dispatch(setSeasonStartRoster({ year: after.season.year, roster: started.managedRoster ?? [], starterIds: started.starterIds }));
      const recruitingTeams = withLeaguePrestige(
        after.league.teams,
        after.season.programLedger,
        after.coach.selectedTeamId,
        after.coach.programPrestigeDrift ?? 0,
      );
      // A board built in the preseason, before any recruiting week ran, carries into the season.
      const preseasonBoard = after.coach.recruitPool.length > 0 && after.coach.recruitingWeekIndex === 0;
      if (!preseasonBoard) dispatch(initializeRecruitingBoard({ seed, teams: recruitingTeams }));
    }

    return seed;
  },
);

/** The conference championships, with a week of load for each game the user's program plays (or rest if none). */
export const simCareerConferenceChampionships = createAsyncThunk<void, void, { state: RootState }>(
  'coach/simCareerConferenceChampionships',
  async (_arg, { dispatch, getState }) => {
    await dispatch(simConferenceChampionships()).unwrap();
    const state = getState();
    if (!state.coach.selectedTeamId) return;
    const run = tournamentRunFor(state.season.conferenceTournaments, state.coach.selectedTeamId);
    const gamesPlayed = run?.games.length ?? 0;
    if (gamesPlayed === 0) {
      dispatch(applyPlayoffRoundFatigue({ played: false }));
      return;
    }
    for (let game = 0; game < gamesPlayed; game += 1) {
      dispatch(applyPlayoffRoundFatigue({ played: true }));
    }
  },
);

export const simCareerPlayoffRound = createAsyncThunk<void, void, { state: RootState }>(
  'coach/simCareerPlayoffRound',
  async (_arg, { dispatch, getState }) => {
    const before = getState();
    const coach = before.coach;
    const playoffState = before.season.playoffs;

    let playedThisRound = false;
    if (coach.selectedTeamId && playoffState) {
      const roundBefore = playoffState.currentRound;
      playedThisRound = playoffState.rounds[roundBefore].some(
        (game) => game.homeTeamId === coach.selectedTeamId || game.awayTeamId === coach.selectedTeamId,
      );
    }

    await dispatch(simNextPlayoffRound()).unwrap();

    if (coach.selectedTeamId) {
      dispatch(applyPlayoffRoundFatigue({ played: playedThisRound }));
    }
  },
);
