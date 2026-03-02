import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../../store/store';
import { simCurrentWeek, selectTeamRecords } from '../season/seasonSlice';
import {
  advanceCoachWeek,
  advanceRecruitingWeek,
  updateJobSecurity,
  recordSeasonEnd,
  resetRecruitingForNewSeason,
  setManagedRoster,
  setStarterIds,
} from './coachSlice';
import { generateRoster } from '../../sim/generateRoster';
import { applyRosterTurnover, buildDefaultStarters } from '../../sim/rosterManagement';

export const runCareerWeeklyCycle = createAsyncThunk<'advanced' | 'skipped', void, { state: RootState }>(
  'coach/runCareerWeeklyCycle',
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const season = state.season;
    const coach = state.coach;

    const canAdvanceRecruiting = coach.recruitPool.length > 0 && Boolean(coach.selectedTeamId);
    const canSimSeasonWeek = season.phase === 'REGULAR' && season.scheduleByWeek.length === 12 && season.currentWeekIndex < 12;

    if (!canSimSeasonWeek) {
      return 'skipped';
    }

    await dispatch(simCurrentWeek());

    // Recruiting updates are optional; season progression should still work even if
    // the user has no active targets on their board.
    if (canAdvanceRecruiting) {
      await dispatch(advanceRecruitingWeek());
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

    if (!coach.selectedTeamId || !coach.programExpectations) return;

    const records = selectTeamRecords(state);
    const userRecord = records[coach.selectedTeamId] ?? { wins: 0, losses: 0 };
    const wins = userRecord.wins;
    const losses = userRecord.losses;

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
    const newJobSecurity = Math.max(0, Math.min(100, coach.jobSecurity + securityDelta));

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

    dispatch(updateJobSecurity(newJobSecurity));
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

    const roster = generateRoster(team, 'league-roster-v1');
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
    const currentRoster = coach.managedRoster ?? generateRoster(team, 'league-roster-v1');

    // Get signed recruits from the most recent completed year
    const latestYear = Math.max(...Object.keys(coach.signedRecruitsByYear).map(Number), 0);
    const signedRecruits = latestYear > 0 ? (coach.signedRecruitsByYear[latestYear] ?? []) : [];

    const newRoster = applyRosterTurnover(currentRoster, signedRecruits, team, newSeed);
    const newStarters = buildDefaultStarters(newRoster);
    dispatch(setManagedRoster(newRoster));
    dispatch(setStarterIds(newStarters));
  },
);
