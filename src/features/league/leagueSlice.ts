import { createSelector, createSlice } from '@reduxjs/toolkit';
import teamsData from '../../data/teams128.json';
import { Conference, LeagueData, Team } from '../../types/sim';
import { RootState } from '../../store/store';
import { programRoster, withLeaguePrestige } from '../../sim/programLedger';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { assertValidLeagueData } from '../../sim/leagueDataValidation';
import { buildRosterSummary } from '../../sim/rosterSummary';

interface LeagueState extends LeagueData {}

const initialState: LeagueState = {
  conferences: teamsData.conferences as Conference[],
  teams: teamsData.teams as Team[],
};

assertValidLeagueData(initialState.conferences, initialState.teams);

const leagueSlice = createSlice({
  name: 'league',
  initialState,
  reducers: {},
});

export const leagueReducer = leagueSlice.reducer;

export const selectConferences = (state: RootState) => state.league.conferences;
export const selectTeams = (state: RootState) => state.league.teams;

export const selectTeamsByConference = createSelector([selectConferences, selectTeams], (conferences, teams) =>
  conferences.map((conference) => ({
    conference,
    teams: teams.filter((team) => team.conferenceId === conference.id),
  })),
);

export const selectTeamById = (state: RootState, teamId: string) => state.league.teams.find((team) => team.id === teamId);

export const selectConferenceById = (state: RootState, conferenceId: string) =>
  state.league.conferences.find((conference) => conference.id === conferenceId);

export const selectTeamWithRosterSummary = createSelector(
  [
    (state: RootState, teamId: string) => selectTeamById(state, teamId),
    (_state: RootState, teamId: string) => teamId,
    (state: RootState) => state.season.seasonSeed,
    (state: RootState) => state.season.programLedger,
  ],
  (team, teamId, seasonSeed, ledger) => {
    if (!team) return null;

    const roster = programRoster(team, ledger, leagueSeasonRosterSeed(seasonSeed));

    return {
      teamId,
      team,
      displayName: `${team.schoolName} ${team.nickname}`,
      rosterSource: 'preview' as const,
      ...buildRosterSummary(roster),
    };
  },
);

export const selectConferenceBrowserRows = createSelector(
  [
    selectConferences,
    selectTeams,
    (state: RootState) => state.season.seasonSeed,
    (state: RootState) => state.season.programLedger,
    (state: RootState) => state.coach.selectedTeamId,
    (state: RootState) => state.coach.programPrestigeDrift,
  ],
  (conferences, teams, seasonSeed, ledger, userTeamId, userDrift) => {
    const rosterKey = leagueSeasonRosterSeed(seasonSeed);
    // Prestige as it stands now, the same number the team page shows. Rosters build from the base team.
    const currentTeams = withLeaguePrestige(teams, ledger, userTeamId, userDrift ?? 0);
    const baseById = new Map(teams.map((team) => [team.id, team]));
    return conferences.map((conference) => {
    const conferenceTeams = currentTeams.filter((team) => team.conferenceId === conference.id);
    const conferenceRosterStrength = Math.round(
      conferenceTeams.reduce((sum, team) => {
        const roster = programRoster(baseById.get(team.id) ?? team, ledger, rosterKey);
        const rosterOverall = roster.reduce((rosterSum, player) => rosterSum + player.overall, 0) / roster.length;
        return sum + rosterOverall;
      }, 0) / conferenceTeams.length,
    );

    return {
      conference,
      teams: conferenceTeams,
      teamCount: conferenceTeams.length,
      averagePrestige: Number(
        (conferenceTeams.reduce((sum, team) => sum + team.prestige, 0) / conferenceTeams.length).toFixed(1),
      ),
      rosterStrength: conferenceRosterStrength,
    };
    });
  },
);
