import { createSelector, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { SeasonState, TeamRecord, GameResult } from '../../types/sim';
import { RootState } from '../../store/store';
import { generateSeasonSchedule } from '../../sim/schedule';
import { simulateGame } from '../../sim/matchEngine';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { selectTeams } from '../league/leagueSlice';
import { buildPlayoffState, selectPlayoffField, simulatePlayoffRound } from '../../sim/playoffs';
import { computeAllSOS, computePlayoffProjection, computeRankings } from '../../sim/rankings';
import { buildCoachGamePlan } from '../../sim/coachEffects';
import { seedToNumber } from '../../sim/rng';

const DEFAULT_TACTICS = {
  tempo: 'normal',
  rideClear: 'balanced',
  slideAggression: 'normal',
  offenseSet: 'balanced',
  defensePackage: 'man',
} as const;

function composeSeasonGameSeed(
  seasonSeed: number,
  weekIndex: number,
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
): number {
  // JSON array encoding prevents delimiter-collision ambiguity while keeping deterministic ordering.
  return seedToNumber(JSON.stringify([seasonSeed, weekIndex, gameId, homeTeamId, awayTeamId]));
}

const initialState: SeasonState = {
  year: 2026,
  currentWeekIndex: 0,
  completedWeeks: 0,
  gameResults: [],
  scheduleByWeek: [],
  isComplete: false,
  phase: 'PRE',
  seasonSeed: 0,
  playoffs: null,
  previousRankByTeamId: {},
};

// Async thunk to start a new season
export const startNewSeason = createAsyncThunk(
  'season/startNewSeason',
  async ({ seed }: { seed: number }, { getState }) => {
    const state = getState() as RootState;
    const teams = state.league.teams;
    const conferences = state.league.conferences;

    // Generate schedule
    const schedule = generateSeasonSchedule(teams, conferences, seed);

    return {
      schedule,
      seed,
    };
  }
);

// Async thunk to simulate the current week
export const simCurrentWeek = createAsyncThunk(
  'season/simCurrentWeek',
  async (_, { getState }) => {
    const state = getState() as RootState;
    const { currentWeekIndex, scheduleByWeek, seasonSeed, gameResults: existingResults } = state.season;
    const coachState = state.coach;
    const teams = selectTeams(state);

    if (currentWeekIndex >= scheduleByWeek.length) {
      throw new Error('Season schedule complete');
    }

    // Snapshot current rankings before this week's results so we can show rank movement.
    const prevRecords = selectTeamRecords(state);
    const prevSos = computeAllSOS(existingResults, prevRecords);
    const prevRankings = computeRankings(teams, prevRecords, 25, prevSos);
    const previousRankByTeamId = Object.fromEntries(prevRankings.map((r) => [r.teamId, r.rank]));

    const gamesToPlay = scheduleByWeek[currentWeekIndex];
    const results: GameResult[] = [];

    // Helper to get roster — uses managed roster for the coached team if available
    const getRoster = (teamId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) throw new Error(`Team ${teamId} not found`);
        if (teamId === coachState.selectedTeamId && coachState.managedRoster && coachState.managedRoster.length > 0) {
            return coachState.managedRoster;
        }
        return generateRoster(team, leagueSeasonRosterSeed(seasonSeed));
    }

    // Helper to get team
    const getTeam = (teamId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) throw new Error(`Team ${teamId} not found`);
        return team;
    }

    // Determine tactics (default for now)
    const coachGamePlan = coachState.selectedTeamId
      ? buildCoachGamePlan({
          baseTactics: coachState.tactics,
          practiceFocus: coachState.practiceFocus,
          fatigue: coachState.teamFatigue,
          archetype: coachState.profile?.archetype,
          coachSkill: coachState.profile?.skill,
          skillTree: coachState.skillTree,
        })
      : null;
    const coachTeamTactics = coachGamePlan?.tactics ?? DEFAULT_TACTICS;

    gamesToPlay.forEach(game => {
      const homeTeam = getTeam(game.homeTeamId);
      const awayTeam = getTeam(game.awayTeamId);
      const homeRoster = getRoster(game.homeTeamId);
      const awayRoster = getRoster(game.awayTeamId);

      const homeTactics = game.homeTeamId === coachState.selectedTeamId ? coachTeamTactics : DEFAULT_TACTICS;
      const awayTactics = game.awayTeamId === coachState.selectedTeamId ? coachTeamTactics : DEFAULT_TACTICS;

      const gameSeed = composeSeasonGameSeed(
        seasonSeed,
        currentWeekIndex,
        game.id,
        game.homeTeamId,
        game.awayTeamId,
      );

      const homeInput =
        game.homeTeamId === coachState.selectedTeamId && coachState.starterIds.length > 0
          ? { team: homeTeam, roster: homeRoster, starterIds: coachState.starterIds, gameplan: coachGamePlan?.modifiers }
          : game.homeTeamId === coachState.selectedTeamId
            ? { team: homeTeam, roster: homeRoster, gameplan: coachGamePlan?.modifiers }
            : { team: homeTeam, roster: homeRoster };
      const awayInput =
        game.awayTeamId === coachState.selectedTeamId && coachState.starterIds.length > 0
          ? { team: awayTeam, roster: awayRoster, starterIds: coachState.starterIds, gameplan: coachGamePlan?.modifiers }
          : game.awayTeamId === coachState.selectedTeamId
            ? { team: awayTeam, roster: awayRoster, gameplan: coachGamePlan?.modifiers }
            : { team: awayTeam, roster: awayRoster };

      const result = simulateGame(homeInput, awayInput, homeTactics, awayTactics, gameSeed);

      // Add metadata to result
      result.id = game.id;
      result.weekIndex = currentWeekIndex;

      results.push(result);
    });

    return { results, previousRankByTeamId };
  }
);

// Async thunk to simulate entire season (rest of it)
export const simSeason = createAsyncThunk(
  'season/simSeason',
  async (_, { dispatch, getState }) => {
    const state = getState() as RootState;
    let { currentWeekIndex } = state.season;
    const { scheduleByWeek } = state.season;

    while (currentWeekIndex < scheduleByWeek.length) {
      await dispatch(simCurrentWeek());
      // Re-fetch state to check new index
      const newState = getState() as RootState;
      currentWeekIndex = newState.season.currentWeekIndex;
    }
  }
);

export const startPlayoffs = createAsyncThunk(
    'season/startPlayoffs',
    async (_, { getState }) => {
        const state = getState() as RootState;
        const teams = selectTeams(state);
        const records = selectTeamRecords(state);
        const sos = computeAllSOS(state.season.gameResults, records);

        // Compute rankings to get top 12
        const rankings = computeRankings(teams, records, 25, sos);
        const seeds = selectPlayoffField(rankings);

        return buildPlayoffState(seeds);
    }
);

export const simNextPlayoffRound = createAsyncThunk(
    'season/simNextPlayoffRound',
    async (_, { getState }) => {
        const state = getState() as RootState;
        const playoffState = state.season.playoffs;
        const teams = selectTeams(state);
        const coach = state.coach;

        if (!playoffState) throw new Error("No active playoffs");

        // Use a base seed for simulation
        const baseSeed = state.season.seasonSeed + 9999;

        const coachGamePlan = coach.selectedTeamId
          ? buildCoachGamePlan({
              baseTactics: coach.tactics,
              practiceFocus: coach.practiceFocus,
              fatigue: coach.teamFatigue,
              archetype: coach.profile?.archetype,
              coachSkill: coach.profile?.skill,
              skillTree: coach.skillTree,
            })
          : null;

        const coachPlay =
          coach.selectedTeamId && coach.managedRoster && coach.managedRoster.length > 0
            ? {
                teamId: coach.selectedTeamId,
                roster: coach.managedRoster,
                starterIds: coach.starterIds,
                tactics: coachGamePlan?.tactics ?? DEFAULT_TACTICS,
                modifiers: coachGamePlan?.modifiers,
              }
            : null;

        return simulatePlayoffRound(
          playoffState,
          teams,
          baseSeed,
          leagueSeasonRosterSeed(state.season.seasonSeed),
          coachPlay,
        );
    }
);


const seasonSlice = createSlice({
  name: 'season',
  initialState,
  reducers: {
    setCurrentWeek: (state, action: PayloadAction<number>) => {
      state.currentWeekIndex = action.payload;
    },
    resetSeason: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(startNewSeason.fulfilled, (state, action) => {
        if (state.phase === 'OFFSEASON') {
          state.year += 1;
        }
        state.scheduleByWeek = action.payload.schedule;
        state.seasonSeed = action.payload.seed;
        state.currentWeekIndex = 0;
        state.completedWeeks = 0;
        state.gameResults = [];
        state.phase = 'REGULAR';
        state.isComplete = false;
        state.playoffs = null;
        state.previousRankByTeamId = {};
      })
      .addCase(simCurrentWeek.fulfilled, (state, action) => {
        state.previousRankByTeamId = action.payload.previousRankByTeamId;
        state.gameResults.push(...action.payload.results);
        state.completedWeeks += 1;
        state.currentWeekIndex += 1;

        if (state.currentWeekIndex >= state.scheduleByWeek.length) {
            state.phase = 'PLAYOFF'; // Ready for playoffs
        }
      })
      .addCase(startPlayoffs.fulfilled, (state, action) => {
          state.playoffs = action.payload;
          state.phase = 'PLAYOFF';
      })
      .addCase(simNextPlayoffRound.fulfilled, (state, action) => {
          state.playoffs = action.payload;
          if (state.playoffs.championTeamId) {
              state.phase = 'OFFSEASON';
              state.isComplete = true;
          }
      });
  },
});

export const { setCurrentWeek, resetSeason } = seasonSlice.actions;
export const seasonReducer = seasonSlice.reducer;

// Selectors
export const selectSeasonSummary = (state: RootState) => ({
    phase: state.season.phase,
    year: state.season.year,
    currentWeekIndex: state.season.currentWeekIndex,
    completedWeeks: state.season.completedWeeks,
    seasonSeed: state.season.seasonSeed,
});

export const selectSeasonHasStarted = (state: RootState) => state.season.phase !== 'PRE';

export const selectWeekGames = (weekIndex: number) => createSelector(
  [(state: RootState) => state.season.scheduleByWeek, (state: RootState) => state.season.gameResults],
  (schedule, results) => {
    const weekSchedule = schedule[weekIndex] || [];
    return weekSchedule.map(game => {
        const result = results.find(r => r.id === game.id);
        return { game, result };
    });
  }
);

export const selectTeamRecords = createSelector(
    [(state: RootState) => state.season.gameResults, (state: RootState) => state.league.teams],
    (results, teams) => {
        const records: Record<string, TeamRecord> = {};
        const conferenceByTeamId: Record<string, string> = {};
        teams.forEach(team => {
            records[team.id] = { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
            conferenceByTeamId[team.id] = team.conferenceId;
        });

        results.forEach(game => {
             const isConferenceGame =
               conferenceByTeamId[game.teamAId] != null &&
               conferenceByTeamId[game.teamAId] === conferenceByTeamId[game.teamBId];

             if (records[game.teamAId]) {
                  records[game.teamAId].pointsFor += game.scoreA;
                  records[game.teamAId].pointsAgainst += game.scoreB;
                  if (game.scoreA > game.scoreB) {
                      records[game.teamAId].wins += 1;
                      if (isConferenceGame) records[game.teamAId].confWins += 1;
                  } else {
                      records[game.teamAId].losses += 1;
                      if (isConferenceGame) records[game.teamAId].confLosses += 1;
                  }
              }

              if (records[game.teamBId]) {
                  records[game.teamBId].pointsFor += game.scoreB;
                  records[game.teamBId].pointsAgainst += game.scoreA;
                  if (game.scoreB > game.scoreA) {
                      records[game.teamBId].wins += 1;
                      if (isConferenceGame) records[game.teamBId].confWins += 1;
                  } else {
                      records[game.teamBId].losses += 1;
                      if (isConferenceGame) records[game.teamBId].confLosses += 1;
                  }
              }
        });
        return records;
    }
);


export const selectConferenceStandings = (conferenceId: string) => createSelector(
    [selectTeams, selectTeamRecords],
    (teams, records) => {
        const confTeams = teams.filter(t => t.conferenceId === conferenceId);
        return confTeams.map(team => ({
            team,
            record: records[team.id]
        })).sort((a, b) => {
            // Sort by conf wins, then overall wins
            if (b.record.confWins !== a.record.confWins) return b.record.confWins - a.record.confWins;
            return b.record.wins - a.record.wins;
        });
    }
);

export const selectOverallStandings = createSelector(
    [selectTeams, selectTeamRecords],
    (teams, records) => {
        const rows = teams.map(team => ({
            team,
            record: records[team.id],
            pointDiff: records[team.id].pointsFor - records[team.id].pointsAgainst
        }));

        return rows.sort((a, b) => b.record.wins - a.record.wins);
    }
);

export const selectTop25Rankings = createSelector(
  [selectTeams, selectTeamRecords, (state: RootState) => state.season.gameResults],
  (teams, records, gameResults) => computeRankings(teams, records, 25, computeAllSOS(gameResults, records)),
);

export const selectTop12Projection = createSelector(
  [selectTeams, selectTeamRecords, (state: RootState) => state.season.gameResults],
  (teams, records, gameResults) => computePlayoffProjection(teams, records, computeAllSOS(gameResults, records)),
);

export const selectPlayoffState = (state: RootState) => state.season.playoffs;

/** Top-25 rows annotated with rank movement since the previous week sim. */
export const selectRankTrends = createSelector(
  [selectTop25Rankings, (state: RootState) => state.season.previousRankByTeamId],
  (top25, prevRanks) =>
    top25.map((row) => {
      const prev = prevRanks[row.teamId];
      const delta = prev != null ? prev - row.rank : null;
      return { ...row, previousRank: prev ?? null, delta };
    }),
);

/** Top 16 for rankings page — includes bubble teams (#13–#16). */
export const selectTop16Rankings = createSelector(
  [selectTeams, selectTeamRecords, (state: RootState) => state.season.gameResults],
  (teams, records, gameResults) => computeRankings(teams, records, 16, computeAllSOS(gameResults, records)),
);

const EMPTY_RECORD = { confWins: 0, confLosses: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 } as const;

/**
 * The user's game on the current week (undefined when not in REGULAR phase,
 * no career team selected, or the user has a bye that week).
 */
export const selectUserUpcomingGame = createSelector(
  [
    (state: RootState) => state.season.scheduleByWeek,
    (state: RootState) => state.season.currentWeekIndex,
    (state: RootState) => state.coach.selectedTeamId,
    (state: RootState) => state.season.phase,
  ],
  (scheduleByWeek, currentWeekIndex, selectedTeamId, phase) => {
    if (phase !== 'REGULAR' || !selectedTeamId) return undefined;
    const weekSchedule = scheduleByWeek[currentWeekIndex] ?? [];
    return weekSchedule.find(
      (g) => g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId,
    );
  },
);

/**
 * The user's most recently completed game result (the last played week).
 */
export const selectUserLastResult = createSelector(
  [
    (state: RootState) => state.season.gameResults,
    (state: RootState) => state.season.currentWeekIndex,
    (state: RootState) => state.coach.selectedTeamId,
  ],
  (gameResults, currentWeekIndex, selectedTeamId) => {
    if (!selectedTeamId || currentWeekIndex === 0) return undefined;
    const lastWeek = currentWeekIndex - 1;
    return gameResults.find(
      (r) => r.weekIndex === lastWeek && (r.teamAId === selectedTeamId || r.teamBId === selectedTeamId),
    );
  },
);

/**
 * The user's standing within their own conference:
 * returns `{ place: number; total: number; confWins: number; confLosses: number }` or null.
 */
export const selectUserConferenceStanding = createSelector(
  [
    selectTeams,
    selectTeamRecords,
    (state: RootState) => state.coach.selectedTeamId,
  ],
  (teams, records, selectedTeamId) => {
    if (!selectedTeamId) return null;
    const userTeam = teams.find((t) => t.id === selectedTeamId);
    if (!userTeam) return null;
    const confTeams = teams.filter((t) => t.conferenceId === userTeam.conferenceId);
    const sorted = confTeams
      .map((t) => ({ id: t.id, rec: records[t.id] ?? EMPTY_RECORD }))
      .sort((a, b) => {
        if (b.rec.confWins !== a.rec.confWins) return b.rec.confWins - a.rec.confWins;
        return b.rec.wins - a.rec.wins;
      });
    const place = sorted.findIndex((t) => t.id === selectedTeamId) + 1;
    const userRec = records[selectedTeamId] ?? EMPTY_RECORD;
    return { place, total: confTeams.length, confWins: userRec.confWins, confLosses: userRec.confLosses };
  },
);
