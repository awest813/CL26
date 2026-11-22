import { createSelector, createSlice } from '@reduxjs/toolkit';
import teamsData from '../../data/teams128.json';
import { Conference, LeagueData, Team } from '../../types/sim';
import { RootState } from '../../store/store';
import { programRoster, withLeaguePrestige } from '../../sim/programLedger';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { assertValidLeagueData } from '../../sim/leagueDataValidation';
import { buildRosterSummary } from '../../sim/rosterSummary';
import { applyTeamOverrides, cleanTeamOverride, type TeamOverride } from '../../sim/teamOverrides';
import { clearAllTeamOverrides, clearTeamOverride, setTeamOverride } from '../settings/settingsSlice';
import { REHYDRATE } from 'redux-persist';

interface LeagueState extends LeagueData {
  /**
   * A mirror of the user's team edits (persisted in settings), so the league can rebuild its
   * teams from the bundled data. The league itself is never persisted.
   */
  teamOverrides?: Record<string, TeamOverride>;
}

const BASE_TEAMS = teamsData.teams as Team[];

const initialState: LeagueState = {
  conferences: teamsData.conferences as Conference[],
  teams: BASE_TEAMS,
  teamOverrides: {},
};

assertValidLeagueData(initialState.conferences, initialState.teams);

function rebrand(state: LeagueState, overrides: Record<string, TeamOverride>) {
  state.teamOverrides = overrides;
  state.teams = applyTeamOverrides(BASE_TEAMS, overrides);
}

const leagueSlice = createSlice({
  name: 'league',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(setTeamOverride, (state, action) => {
        const clean = cleanTeamOverride(action.payload.override);
        const overrides = { ...(state.teamOverrides ?? {}) };
        if (Object.keys(clean).length === 0) delete overrides[action.payload.teamId];
        else overrides[action.payload.teamId] = clean;
        rebrand(state, overrides);
      })
      .addCase(clearTeamOverride, (state, action) => {
        const overrides = { ...(state.teamOverrides ?? {}) };
        delete overrides[action.payload];
        rebrand(state, overrides);
      })
      .addCase(clearAllTeamOverrides, (state) => {
        rebrand(state, {});
      })
      // The saved edits come back with the rest of the save on load.
      .addMatcher(
        (action): action is { type: string; payload?: { settings?: { teamOverrides?: Record<string, TeamOverride> } } } => action.type === REHYDRATE,
        (state, action) => {
          rebrand(state, action.payload?.settings?.teamOverrides ?? {});
        },
      );
  },
});

export const leagueReducer = leagueSlice.reducer;

export const selectConferences = (state: RootState) => state.league.conferences;
export const selectTeams = (state: RootState) => state.league.teams;
/** A team as the bundled data has it, before the user's edits. */
export const baseTeamById = (teamId: string): Team | undefined => BASE_TEAMS.find((team) => team.id === teamId);

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
