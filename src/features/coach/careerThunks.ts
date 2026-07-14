import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../../store/store';
import { simCurrentWeek, selectTeamRecords } from '../season/seasonSlice';
import {
  advanceCoachWeek,
  advanceRecruitingWeek,
  addCoachXp,
  setAdPressure,
  updateJobSecurity,
  recordSeasonEnd,
  resetRecruitingForNewSeason,
  setManagedRoster,
  setStarterIds,
  applyPrestigeDrift,
  setPendingJobOffers,
  initializeRecruitingBoard,
  updateProgramStanding,
  careerSetupFromPrestige,
} from './coachSlice';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { applyRosterTurnover, applyWeeklyTraitGrowth, buildDefaultStarters } from '../../sim/rosterManagement';
import { computeAllSOS, computeRankings } from '../../sim/rankings';
import { seedToNumber } from '../../sim/rng';
import { startNewSeason } from '../season/seasonSlice';

const BASE_WEEKLY_XP = 8;
const WINNING_WEEK_XP_BONUS = 3;
const WIN_GAP_PRESSURE_MULTIPLIER = 2;
const RANK_GAP_PRESSURE_DIVISOR = 6;
const DEFAULT_AD_PRESSURE = 45;
const FACILITY_PRESSURE_RELIEF_BASELINE = 50;
const FACILITY_PRESSURE_RELIEF_DIVISOR = 6;
const SECURITY_PENALTY_NEUTRAL_PRESSURE = 50;
const SECURITY_PENALTY_DIVISOR = 6;
const TOTAL_TEAMS = 128;
const CHAMPION_PRESTIGE_DRIFT = 4;
const PLAYOFF_PRESTIGE_DRIFT = 2;
const TARGET_MET_PRESTIGE_DRIFT = 1;
const MODERATE_MISS_PRESTIGE_DRIFT = -2;
const SEVERE_MISS_PRESTIGE_DRIFT = -3;

function computePrestigeDriftDelta(champion: boolean, madePlayoffs: boolean, winDiff: number): number {
  if (champion) return CHAMPION_PRESTIGE_DRIFT;
  if (madePlayoffs) return PLAYOFF_PRESTIGE_DRIFT;
  if (winDiff >= 0) return TARGET_MET_PRESTIGE_DRIFT;
  if (winDiff <= -4) return SEVERE_MISS_PRESTIGE_DRIFT;
  if (winDiff <= -2) return MODERATE_MISS_PRESTIGE_DRIFT;
  return 0;
}

function getOfferTier(teamPrestige: number, effectivePrestige: number): 'UPGRADE' | 'LATERAL' {
  return teamPrestige > effectivePrestige ? 'UPGRADE' : 'LATERAL';
}

export const runCareerWeeklyCycle = createAsyncThunk<'advanced' | 'skipped', void, { state: RootState }>(
  'coach/runCareerWeeklyCycle',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const season = state.season;
    const coach = state.coach;

    const canAdvanceRecruiting = coach.recruitPool.length > 0 && Boolean(coach.selectedTeamId);
    const canSimSeasonWeek =
      season.phase === 'REGULAR' &&
      season.scheduleByWeek.length > 0 &&
      season.currentWeekIndex < season.scheduleByWeek.length;

    if (!canSimSeasonWeek) {
      return 'skipped';
    }

    await dispatch(simCurrentWeek());

    // Recruiting updates are optional; season progression should still work even if
    // the user has no active targets on their board.
    if (canAdvanceRecruiting) {
      await dispatch(advanceRecruitingWeek());
    }

    const postWeekState = getState();
    const postWeekCoach = postWeekState.coach;
    const postWeekSeason = postWeekState.season;
    const userRecord = postWeekCoach.selectedTeamId
      ? selectTeamRecords(postWeekState)[postWeekCoach.selectedTeamId]
      : undefined;
    const weeklyXp =
      BASE_WEEKLY_XP +
      (userRecord && userRecord.wins + userRecord.losses > 0 && userRecord.wins > userRecord.losses ? WINNING_WEEK_XP_BONUS : 0) +
      (postWeekCoach.skillTree?.operations ?? 0);
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

export const processSeasonEnd = createAsyncThunk<void, void, { state: RootState }>(
  'coach/processSeasonEnd',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const coach = state.coach;
    const season = state.season;

    if (season.phase !== 'OFFSEASON') return;
    if (!coach.selectedTeamId || !coach.programExpectations) return;
    if (coach.seasonHistory.some((entry) => entry.year === season.year)) return;
    // Signing day must resolve before finalize (empty class still writes []).
    if (!Object.prototype.hasOwnProperty.call(coach.signedRecruitsByYear, season.year)) return;

    const records = selectTeamRecords(state);
    const teams = state.league.teams;
    const userRecord = records[coach.selectedTeamId] ?? { wins: 0, losses: 0 };
    const wins = userRecord.wins;
    const losses = userRecord.losses;

    const sos = computeAllSOS(season.gameResults, records);
    const rankingsTable = computeRankings(teams, records, 128, sos);
    const userPollRow = rankingsTable.find((r) => r.teamId === coach.selectedTeamId);
    const pollRank = userPollRow?.rank ?? TOTAL_TEAMS;
    const rankTarget = coach.programExpectations.rankTarget;

    // Determine playoff outcomes
    const playoffSeeds = season.playoffs?.seeds ?? [];
    const madePlayoffs = playoffSeeds.some((s) => s.teamId === coach.selectedTeamId);
    const champion = season.playoffs?.championTeamId === coach.selectedTeamId;

    // Job security delta: compare actual wins to win target
    const winDiff = wins - coach.programExpectations.winTarget;
    let securityDelta: number;
    if (champion) {
      securityDelta = 25;
    } else if (madePlayoffs) {
      securityDelta = 10;
    } else if (winDiff >= 2) {
      securityDelta = 12;
    } else if (winDiff >= 0) {
      securityDelta = 4;
    } else if (winDiff >= -2) {
      securityDelta = -10;
    } else {
      securityDelta = -22;
    }

    const gamesPlayed = wins + losses;
    if (gamesPlayed >= 8 && pollRank <= rankTarget) {
      securityDelta += 5;
    }
    if (gamesPlayed >= 8 && pollRank > rankTarget + 10 && !madePlayoffs) {
      securityDelta -= 8;
    }

    const winExpectationGap = Math.max(0, coach.programExpectations.winTarget - wins);
    const rankExpectationGap = Math.max(0, pollRank - rankTarget);
    const baseAdPressure =
      (coach.adPressure ?? DEFAULT_AD_PRESSURE) +
      winExpectationGap * WIN_GAP_PRESSURE_MULTIPLIER +
      Math.floor(rankExpectationGap / RANK_GAP_PRESSURE_DIVISOR);
    const resourceShield = Math.round(
      ((coach.programResources?.facilities ?? FACILITY_PRESSURE_RELIEF_BASELINE) - FACILITY_PRESSURE_RELIEF_BASELINE) /
        FACILITY_PRESSURE_RELIEF_DIVISOR,
    );
    const boostedPressure = Math.max(0, Math.min(100, baseAdPressure - resourceShield));
    const pressurePenalty = Math.round(
      (boostedPressure - SECURITY_PENALTY_NEUTRAL_PRESSURE) / SECURITY_PENALTY_DIVISOR,
    );

    const newJobSecurity = Math.max(0, Math.min(100, coach.jobSecurity + securityDelta - pressurePenalty));
    const prestigeDriftDelta = computePrestigeDriftDelta(champion, madePlayoffs, winDiff);
    const currentTeam = teams.find((team) => team.id === coach.selectedTeamId);
    const currentEffectivePrestige = Math.max(
      1,
      Math.min(100, (currentTeam?.prestige ?? 50) + (coach.programPrestigeDrift ?? 0) + prestigeDriftDelta),
    );

    // Signing class stats
    const signedClass = coach.signedRecruitsByYear[season.year] ?? [];
    const avgRecruitStars =
      signedClass.length > 0
        ? signedClass.reduce((sum, s) => sum + s.stars, 0) / signedClass.length
        : 0;

    dispatch(recordSeasonEnd({
      year: season.year,
      wins,
      losses,
      madePlayoffs,
      champion,
      recruitsSigned: signedClass.length,
      avgRecruitStars: Math.round(avgRecruitStars * 100) / 100,
      jobSecurityEnd: newJobSecurity,
    }));

    dispatch(setAdPressure(boostedPressure));
    dispatch(updateJobSecurity(newJobSecurity));
    dispatch(applyPrestigeDrift(prestigeDriftDelta));

    // Raise or lower program expectations as prestige drifts across a long career.
    const standing = careerSetupFromPrestige(currentEffectivePrestige);
    dispatch(updateProgramStanding(standing));

    if (newJobSecurity >= 68 || champion) {
      const candidateOffers = teams
        .filter((team) => team.id !== coach.selectedTeamId && team.prestige >= currentEffectivePrestige)
        .map((team) => ({
          team,
          sortKey: seedToNumber(`${season.seasonSeed}:${season.year}:${coach.selectedTeamId}:${team.id}`),
        }))
        .sort((a, b) => {
          const prestigeComparison = b.team.prestige - a.team.prestige;
          if (prestigeComparison !== 0) return prestigeComparison;
          return a.sortKey - b.sortKey;
        })
        .slice(0, champion ? 2 : 1)
        .map(({ team }) => ({
          teamId: team.id,
          tier: getOfferTier(team.prestige, currentEffectivePrestige),
          presentedAtYear: season.year,
        }));
      dispatch(setPendingJobOffers(candidateOffers));
    } else {
      dispatch(setPendingJobOffers([]));
    }
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

    const rosterSeed = leagueSeasonRosterSeed(state.season.seasonSeed);
    const roster = generateRoster(team, rosterSeed);
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

    const newRoster = applyRosterTurnover(currentRoster, signedRecruits, team, newSeed, {
      coachArchetype: coach.profile?.archetype,
      developmentSkill: coach.skillTree?.development ?? 0,
      operationsSkill: coach.skillTree?.operations ?? 0,
      facilitiesLevel: coach.programResources?.facilities ?? 50,
      boostersLevel: coach.programResources?.boosters ?? 50,
    });
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
    if (!coach.seasonHistory.some((entry) => entry.year === season.year)) return null;
    // Signing day must have produced an entry for this year (empty class still records []).
    if (!Object.prototype.hasOwnProperty.call(coach.signedRecruitsByYear, season.year)) return null;

    const nextSeed = season.seasonSeed + 1;
    await dispatch(applyOffseasonRosterTurnover({ newSeed: nextSeed }));
    await dispatch(startNewSeason({ seed: nextSeed })).unwrap();

    const drift = getState().coach.programPrestigeDrift ?? 0;
    const recruitingTeams = league.teams.map((team) =>
      team.id === coach.selectedTeamId
        ? { ...team, prestige: Math.max(1, Math.min(100, team.prestige + drift)) }
        : team,
    );
    dispatch(initializeRecruitingBoard({ seed: nextSeed, teams: recruitingTeams }));
    return nextSeed;
  },
);

/**
 * PRE → REGULAR handoff for the first (or soft-reset) season.
 * Generates the schedule, refreshes the managed roster to the season seed, and opens recruiting.
 */
export const beginFirstSeason = createAsyncThunk<number, { seed: number }, { state: RootState }>(
  'coach/beginFirstSeason',
  async ({ seed }, { dispatch, getState }) => {
    const state = getState();
    if (state.season.phase !== 'PRE') {
      throw new Error('beginFirstSeason only runs from preseason.');
    }
    if (state.coach.seasonHistory.some((entry) => entry.year === state.season.year)) {
      throw new Error(
        `Year ${state.season.year} is already in career history. Finish the offseason handoff or start a new game from Home.`,
      );
    }

    await dispatch(startNewSeason({ seed })).unwrap();

    const after = getState();
    if (after.coach.selectedTeamId && after.coach.onboardingStep === 'READY') {
      await dispatch(initializeManagedRoster());
      const drift = after.coach.programPrestigeDrift ?? 0;
      const recruitingTeams = after.league.teams.map((team) =>
        team.id === after.coach.selectedTeamId
          ? { ...team, prestige: Math.max(1, Math.min(100, team.prestige + drift)) }
          : team,
      );
      dispatch(initializeRecruitingBoard({ seed, teams: recruitingTeams }));
    }

    return seed;
  },
);
