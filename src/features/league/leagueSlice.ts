import { createSelector, createSlice } from '@reduxjs/toolkit';
import teamsData from '../../data/teams128.json';
import { Conference, LeagueData, Team } from '../../types/sim';
import { RootState } from '../../store/store';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { assertValidLeagueData } from '../../sim/leagueDataValidation';

interface LeagueState extends LeagueData {}

const initialState: LeagueState = {
  conferences: teamsData.conferences as Conference[],
  teams: teamsData.teams as Team[],
};

assertValidLeagueData(initialState.conferences, initialState.teams);

const POSITION_ORDER = ['A', 'M', 'D', 'LSM', 'FO', 'G'] as const;
const YEAR_LABELS = {
  1: 'Fr',
  2: 'So',
  3: 'Jr',
  4: 'Sr',
} as const;
const SENIOR_EXPERIENCE_WEIGHT = 100;
const UNDERCLASS_EXPERIENCE_WEIGHT = 35;

function rosterAverage(values: number[]): number {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

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
    const positionSummary = POSITION_ORDER.map((position) => {
      const players = roster.filter((player) => player.position === position);
      return {
        position,
        count: players.length,
        avgOverall: rosterAverage(players.map((player) => player.overall)),
      };
    });
    const classSummary = ([1, 2, 3, 4] as const).map((year) => ({
      year,
      label: YEAR_LABELS[year],
      count: roster.filter((player) => player.year === year).length,
    }));
    const attackers = roster.filter((player) => player.position === 'A' || player.position === 'M');
    const defenders = roster.filter((player) => player.position === 'D' || player.position === 'LSM');
    const faceoff = roster.filter((player) => player.position === 'FO');
    const goalies = roster.filter((player) => player.position === 'G');
    const seniors = roster.filter((player) => player.year === 4).length;
    const underclassmen = roster.filter((player) => player.year <= 2).length;

    return {
      teamId,
      team,
      displayName: `${team.schoolName} ${team.nickname}`,
      rosterSize: roster.length,
      rosterOverall: overall,
      topPlayers,
      positionSummary,
      classSummary,
      unitStrengths: {
        offense: rosterAverage(attackers.map((player) => (player.shooting + player.passing + player.IQ) / 3)),
        defense: rosterAverage(defenders.map((player) => (player.defense + player.speed + player.IQ) / 3)),
        faceoff: rosterAverage(faceoff.map((player) => player.overall)),
        goalie: rosterAverage(goalies.map((player) => (player.defense + player.IQ) / 2)),
        experience: Math.round(
          (seniors * SENIOR_EXPERIENCE_WEIGHT + underclassmen * UNDERCLASS_EXPERIENCE_WEIGHT) / roster.length,
        ),
      },
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
