import { createSelector, createSlice } from '@reduxjs/toolkit';
import teamsData from '../../data/teams128.json';
import { Conference, LeagueData, Team } from '../../types/sim';
import { RootState } from '../../store/store';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';

interface LeagueState extends LeagueData {}

const initialState: LeagueState = {
  conferences: teamsData.conferences as Conference[],
  teams: teamsData.teams as Team[],
};

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
  ],
  (team, teamId, seasonSeed) => {
    if (!team) return null;

    const roster = generateRoster(team, leagueSeasonRosterSeed(seasonSeed));
    const overall = Math.round(roster.reduce((sum, player) => sum + player.overall, 0) / roster.length);
    const topPlayers = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 5);

    return {
      teamId,
      team,
      rosterSize: roster.length,
      rosterOverall: overall,
      topPlayers,
    };
  },
);

export const selectConferenceBrowserRows = createSelector(
  [selectConferences, selectTeams, (state: RootState) => state.season.seasonSeed],
  (conferences, teams, seasonSeed) => {
    const rosterKey = leagueSeasonRosterSeed(seasonSeed);
    return conferences.map((conference) => {
    const conferenceTeams = teams.filter((team) => team.conferenceId === conference.id);
    const conferenceRosterStrength = Math.round(
      conferenceTeams.reduce((sum, team) => {
        const roster = generateRoster(team, rosterKey);
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
