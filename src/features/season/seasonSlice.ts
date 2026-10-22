import { createSelector, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { SeasonState, TeamRecord, GameResult, ProgramLedger, ProgramLedgerEntry } from '../../types/sim';
import { RootState } from '../../store/store';
import { generateSeasonSchedule } from '../../sim/schedule';
import { simulateGame } from '../../sim/matchEngine';
import { programTactics } from '../../sim/schemeMatchups';
import { generateRoster } from '../../sim/generateRoster';
import { leagueSeasonRosterSeed } from '../../sim/leagueRosterSeed';
import { selectTeams } from '../league/leagueSlice';
import { buildPlayoffField, buildPlayoffState, firstTeamsOut, selectPlayoffField, simulatePlayoffRound } from '../../sim/playoffs';
import { computePollInputs, computeRankings } from '../../sim/rankings';
import { compareConferenceStanding, compareOverallStanding, conferenceLeaders } from '../../sim/standings';
import { programRoster, programStarters, withLeaguePrestige } from '../../sim/programLedger';
import { conferenceChampions, playConferenceTournaments, type TournamentSide } from '../../sim/conferenceTournaments';
import { addGamesToSeasonStats, allAmericanTeams, seasonAwards, storedGameResult } from '../../sim/seasonStats';
import { buildCoachGamePlan } from '../../sim/coachEffects';
import { rosterForAvailability, weeklyScratches } from '../../sim/injuries';
import { DEFAULT_TACTICS } from '../../sim/tactics';
import { seedToNumber } from '../../sim/rng';
import {
  assertCanInitializePlayoffs,
  assertCanSimRegularWeek,
  assertCanSimulatePlayoffRound,
  assertCanSoftResetSeason,
  assertCanStartNewSeason,
  canStartNewSeason,
  playoffStageFor,
  seasonCapabilities,
} from '../../sim/seasonPhase';

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
  lastAppliedWeekSimId: null,
  programLedger: {},
  programLedgerYear: null,
  trophyHolders: {},
  playerSeasonStats: {},
  awardHistory: {},
  allAmericanHistory: {},
  conferenceTournaments: null,
};

// Async thunk to start a new season — only PRE (year 1) or OFFSEASON (next year).
export const startNewSeason = createAsyncThunk(
  'season/startNewSeason',
  async ({ seed }: { seed: number }, { getState }) => {
    const state = getState() as RootState;
    assertCanStartNewSeason(state.season.phase);

    const teams = state.league.teams;
    const conferences = state.league.conferences;
    const schedule = generateSeasonSchedule(teams, conferences, seed);

    return {
      schedule,
      seed,
      fromPhase: state.season.phase,
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
    const ledger = state.season.programLedger;
    const rankingTeams = withLeaguePrestige(
      teams,
      ledger,
      coachState.selectedTeamId,
      coachState.programPrestigeDrift ?? 0,
    );

    assertCanSimRegularWeek(state.season);

    // Snapshot current rankings before this week's results so we can show rank movement.
    const prevRecords = selectTeamRecords(state);
    const prevRankings = computeRankings(rankingTeams, prevRecords, 25, computePollInputs(existingResults, prevRecords));
    const previousRankByTeamId = Object.fromEntries(prevRankings.map((r) => [r.teamId, r.rank]));

    const gamesToPlay = scheduleByWeek[currentWeekIndex];
    const results: GameResult[] = [];
    const yearByPlayerId = new Map<string, 1 | 2 | 3 | 4>();

    // CPU programs: this season's roster from the ledger, the staff's depth chart, and this week's scratches.
    const rosterSeed = leagueSeasonRosterSeed(seasonSeed);
    const cpuLineup = (teamId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) throw new Error(`Team ${teamId} not found`);
        const roster = programRoster(team, ledger, rosterSeed);
        return rosterForAvailability(
          roster,
          programStarters(roster),
          weeklyScratches(roster, seasonSeed, `w${currentWeekIndex}`, teamId),
        );
    };

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
    const userAvailability =
      coachState.selectedTeamId && coachState.managedRoster && coachState.managedRoster.length > 0
        ? rosterForAvailability(
            coachState.managedRoster,
            coachState.starterIds,
            weeklyScratches(
              coachState.managedRoster,
              seasonSeed,
              `w${currentWeekIndex}`,
              coachState.selectedTeamId,
            ),
          )
        : null;

    gamesToPlay.forEach(game => {
      const homeTeam = getTeam(game.homeTeamId);
      const awayTeam = getTeam(game.awayTeamId);
      const homeLineup = game.homeTeamId === coachState.selectedTeamId
        ? userAvailability ?? { roster: generateRoster(homeTeam, rosterSeed), starterIds: [] }
        : cpuLineup(game.homeTeamId);
      const awayLineup = game.awayTeamId === coachState.selectedTeamId
        ? userAvailability ?? { roster: generateRoster(awayTeam, rosterSeed), starterIds: [] }
        : cpuLineup(game.awayTeamId);

      // Every CPU program runs its own staff's scheme.
      const homeTactics = game.homeTeamId === coachState.selectedTeamId ? coachTeamTactics : programTactics(homeTeam);
      const awayTactics = game.awayTeamId === coachState.selectedTeamId ? coachTeamTactics : programTactics(awayTeam);

      const gameSeed = composeSeasonGameSeed(
        seasonSeed,
        currentWeekIndex,
        game.id,
        game.homeTeamId,
        game.awayTeamId,
      );

      const lineupInput = (team: typeof homeTeam, lineup: { roster: typeof homeLineup.roster; starterIds: string[] }) => {
        const isCoach = team.id === coachState.selectedTeamId;
        return {
          team,
          roster: lineup.roster,
          ...(lineup.starterIds.length > 0 ? { starterIds: lineup.starterIds } : {}),
          ...(isCoach ? { gameplan: coachGamePlan?.modifiers } : {}),
        };
      };
      const homeInput = lineupInput(homeTeam, homeLineup);
      const awayInput = lineupInput(awayTeam, awayLineup);

      const result = simulateGame(homeInput, awayInput, homeTactics, awayTactics, gameSeed);

      // Add metadata to result
      result.id = game.id;
      result.weekIndex = currentWeekIndex;

      for (const player of [...homeLineup.roster, ...awayLineup.roster]) yearByPlayerId.set(player.id, player.year);
      results.push(result);
    });

    // Fold the box scores into season totals, then keep only what the save needs.
    const playerSeasonStats = addGamesToSeasonStats(state.season.playerSeasonStats, results, yearByPlayerId);
    const storedResults = results.map((result) => storedGameResult(
      result,
      result.teamAId === coachState.selectedTeamId || result.teamBId === coachState.selectedTeamId,
    ));

    return { results: storedResults, previousRankByTeamId, playerSeasonStats };
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
      const before = currentWeekIndex;
      await dispatch(simCurrentWeek());
      const newState = getState() as RootState;
      currentWeekIndex = newState.season.currentWeekIndex;
      if (currentWeekIndex === before) break;
    }
  }
);

/**
 * Lineup and scheme for each side of a conference championship game: the coach's roster,
 * depth chart, install, and scheme for the user's program; ledger rosters, staff depth
 * charts, and schemes for CPU programs. Both lose players to that week's injuries.
 */
function conferenceTournamentSides(state: RootState): (teamId: string, weekKey: string) => TournamentSide {
  const teams = selectTeams(state);
  const { coach, season } = state;
  const rosterSeed = leagueSeasonRosterSeed(season.seasonSeed);
  const plan = coach.selectedTeamId
    ? buildCoachGamePlan({
        baseTactics: coach.tactics,
        practiceFocus: coach.practiceFocus,
        fatigue: coach.teamFatigue,
        archetype: coach.profile?.archetype,
        coachSkill: coach.profile?.skill,
        skillTree: coach.skillTree,
      })
    : null;
  return (teamId, weekKey) => {
    const team = teams.find((row) => row.id === teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    if (teamId === coach.selectedTeamId) {
      const roster = coach.managedRoster && coach.managedRoster.length > 0 ? coach.managedRoster : generateRoster(team, rosterSeed);
      const lineup = rosterForAvailability(roster, coach.starterIds, weeklyScratches(roster, season.seasonSeed, weekKey, teamId));
      return {
        input: { team, roster: lineup.roster, ...(lineup.starterIds.length > 0 ? { starterIds: lineup.starterIds } : {}), gameplan: plan?.modifiers },
        tactics: plan?.tactics ?? DEFAULT_TACTICS,
      };
    }
    const roster = programRoster(team, season.programLedger, rosterSeed);
    const lineup = rosterForAvailability(roster, programStarters(roster), weeklyScratches(roster, season.seasonSeed, weekKey, teamId));
    return { input: { team, roster: lineup.roster, starterIds: lineup.starterIds }, tactics: programTactics(team) };
  };
}

function playTournaments(state: RootState) {
  return playConferenceTournaments({
    teams: selectTeams(state),
    conferences: state.league.conferences,
    recordsByTeamId: selectTeamRecords(state),
    seasonSeed: state.season.seasonSeed,
    sideFor: conferenceTournamentSides(state),
  });
}

/** Between the regular season and selection: every conference's top four plays for its title. */
export const simConferenceChampionships = createAsyncThunk(
  'season/simConferenceChampionships',
  async (_, { getState }) => {
    const state = getState() as RootState;
    assertCanInitializePlayoffs(state.season);
    if (state.season.conferenceTournaments) throw new Error('The conference championships have already been played.');
    return playTournaments(state);
  },
);

export const startPlayoffs = createAsyncThunk(
    'season/startPlayoffs',
    async (_, { getState }) => {
        const state = getState() as RootState;
        assertCanInitializePlayoffs(state.season);
        // Selection waits on the conference championships; play them now if nobody has.
        const tournaments = state.season.conferenceTournaments ?? playTournaments(state);

        const teams = selectTeams(state);
        const rankingTeams = withLeaguePrestige(
          teams,
          state.season.programLedger,
          state.coach.selectedTeamId,
          state.coach.programPrestigeDrift ?? 0,
        );
        const records = selectTeamRecords(state);


        // Compute rankings to get top 12. Earned prestige drift is included for the coached program.
        const rankings = computeRankings(rankingTeams, records, rankingTeams.length, computePollInputs(state.season.gameResults, records));
        // The six highest-ranked conference champions are in; the other six spots are at-large.
        const champions = conferenceChampions(tournaments, conferenceLeaders(teams, records));
        const seeds = selectPlayoffField(rankings, Object.values(champions));

        return { playoffs: buildPlayoffState(seeds), tournaments };
    }
);

export const simNextPlayoffRound = createAsyncThunk(
    'season/simNextPlayoffRound',
    async (_, { getState }) => {
        const state = getState() as RootState;
        assertCanSimulatePlayoffRound(state.season);

        const playoffState = state.season.playoffs!;
        const teams = selectTeams(state);
        const coach = state.coach;

        // Use a base seed for simulation
        const baseSeed = state.season.seasonSeed + 9999;
        const rosterSeed = leagueSeasonRosterSeed(state.season.seasonSeed);

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

        // Always apply coach tactics/modifiers when a program is selected — fall back to
        // generated roster if managed roster is empty (same as regular-season week sim).
        let coachPlay: {
          teamId: string;
          roster: ReturnType<typeof generateRoster>;
          starterIds: string[];
          tactics: typeof DEFAULT_TACTICS | NonNullable<typeof coachGamePlan>['tactics'];
          modifiers: NonNullable<typeof coachGamePlan>['modifiers'] | undefined;
        } | null = null;

        if (coach.selectedTeamId) {
          const coachTeam = teams.find((t) => t.id === coach.selectedTeamId);
          const roster =
            coach.managedRoster && coach.managedRoster.length > 0
              ? coach.managedRoster
              : coachTeam
                ? generateRoster(coachTeam, rosterSeed)
                : [];
          const available = roster.length > 0
            ? rosterForAvailability(
                roster,
                coach.starterIds,
                weeklyScratches(roster, state.season.seasonSeed, playoffState.currentRound, coach.selectedTeamId),
              )
            : { roster, starterIds: coach.starterIds };
          coachPlay = {
            teamId: coach.selectedTeamId,
            roster: available.roster,
            starterIds: available.starterIds,
            tactics: coachGamePlan?.tactics ?? DEFAULT_TACTICS,
            modifiers: coachGamePlan?.modifiers,
          };
        }

        const nextState = simulatePlayoffRound(
          playoffState,
          teams,
          baseSeed,
          rosterSeed,
          coachPlay,
          { ledger: state.season.programLedger, seasonSeed: state.season.seasonSeed },
        );

        return nextState;
    }
);


const seasonSlice = createSlice({
  name: 'season',
  initialState,
  reducers: {
    /**
     * Soft reset to PRE. Blocked in PLAYOFF/OFFSEASON unless force is set
     * (used by Home "New Game" which also resets coach state).
     */
    resetSeason: (
      state,
      action: PayloadAction<{ preserveYear?: boolean; force?: boolean } | undefined>,
    ) => {
      const force = action?.payload?.force === true;
      if (!force) {
        assertCanSoftResetSeason(state.phase);
      }
      const year = action?.payload?.preserveYear ? state.year : initialState.year;
      // A new game starts the league over; restarting the current season keeps how programs stand.
      if (force) return { ...initialState, year };
      return {
        ...initialState,
        year,
        programLedger: state.programLedger ?? {},
        programLedgerYear: state.programLedgerYear ?? null,
        trophyHolders: state.trophyHolders ?? {},
        awardHistory: state.awardHistory ?? {},
        allAmericanHistory: state.allAmericanHistory ?? {},
      };
    },
    /** Fold a finished season into the ledger. Ignored if that season was already counted. */
    applyProgramLedger: (state, action: PayloadAction<{ ledger: ProgramLedger; year: number }>) => {
      if (state.programLedgerYear === action.payload.year) return;
      state.programLedger = action.payload.ledger;
      state.programLedgerYear = action.payload.year;
    },
    /** Write one program's standing, e.g. the prestige a coach built before leaving for another job. */
    setProgramLedgerEntry: (state, action: PayloadAction<{ teamId: string; entry: ProgramLedgerEntry }>) => {
      state.programLedger = { ...(state.programLedger ?? {}), [action.payload.teamId]: action.payload.entry };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startNewSeason.fulfilled, (state, action) => {
        // Reject stale fulfills from illegal phases (TOCTOU / direct dispatch races).
        if (!canStartNewSeason(action.payload.fromPhase) || state.phase !== action.payload.fromPhase) {
          return;
        }
        if (action.payload.fromPhase === 'OFFSEASON') {
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
        state.lastAppliedWeekSimId = null;
        state.playerSeasonStats = {};
        state.conferenceTournaments = null;
      })
      .addCase(simCurrentWeek.fulfilled, (state, action) => {
        if (state.phase !== 'REGULAR') return;
        const results = action.payload.results;
        if (results.length === 0) return;
        const weekIndex = results[0]?.weekIndex;
        if (weekIndex == null || weekIndex !== state.currentWeekIndex) return;
        if (results.some((game) => game.weekIndex !== weekIndex)) return;
        if (state.gameResults.some((game) => game.weekIndex === weekIndex)) return;

        state.lastAppliedWeekSimId = action.meta.requestId;
        state.previousRankByTeamId = action.payload.previousRankByTeamId;
        state.gameResults.push(...results);
        state.playerSeasonStats = action.payload.playerSeasonStats;

        // A rivalry winner takes (or keeps) the trophy.
        for (const game of state.scheduleByWeek[weekIndex] ?? []) {
          if (!game.rivalryTrophy) continue;
          const result = results.find((row) => row.id === game.id);
          if (!result || result.scoreA === result.scoreB) continue;
          const winnerId = result.scoreA > result.scoreB ? result.teamAId : result.teamBId;
          state.trophyHolders = { ...(state.trophyHolders ?? {}), [game.rivalryTrophy]: winnerId };
        }
        state.completedWeeks += 1;
        state.currentWeekIndex += 1;

        if (state.currentWeekIndex >= state.scheduleByWeek.length) {
            state.phase = 'PLAYOFF'; // Ready for playoffs (bracket pending)
            // The regular season is over: name the national awards.
            state.awardHistory = { ...(state.awardHistory ?? {}), [state.year]: seasonAwards(state.playerSeasonStats) };
            state.allAmericanHistory = { ...(state.allAmericanHistory ?? {}), [state.year]: allAmericanTeams(state.playerSeasonStats) };
        }
      })
      .addCase(simConferenceChampionships.fulfilled, (state, action) => {
          if (state.phase !== 'PLAYOFF' || state.playoffs || state.conferenceTournaments) return;
          state.conferenceTournaments = action.payload;
      })
      .addCase(startPlayoffs.fulfilled, (state, action) => {
          // Idempotent: ignore duplicate fulfills once bracket exists.
          if (state.phase !== 'PLAYOFF' || state.playoffs) return;
          state.playoffs = action.payload.playoffs;
          state.conferenceTournaments = state.conferenceTournaments ?? action.payload.tournaments;
      })
      .addCase(simNextPlayoffRound.fulfilled, (state, action) => {
          if (state.phase !== 'PLAYOFF') return;
          state.playoffs = action.payload;
          if (state.playoffs.championTeamId) {
              state.phase = 'OFFSEASON';
              state.isComplete = true;
          }
      });
  },
});

export const { resetSeason, applyProgramLedger, setProgramLedgerEntry } = seasonSlice.actions;
export const seasonReducer = seasonSlice.reducer;

// Selectors
// Memoized so components that read it do not re-render on every store update.
export const selectSeasonSummary = createSelector(
  [
    (state: RootState) => state.season.phase,
    (state: RootState) => state.season.year,
    (state: RootState) => state.season.currentWeekIndex,
    (state: RootState) => state.season.completedWeeks,
    (state: RootState) => state.season.seasonSeed,
  ],
  (phase, year, currentWeekIndex, completedWeeks, seasonSeed) => ({
    phase,
    year,
    currentWeekIndex,
    completedWeeks,
    seasonSeed,
  }),
);

export const selectSeasonHasStarted = (state: RootState) => state.season.phase !== 'PRE';

export const selectSeasonCapabilities = createSelector(
  [(state: RootState) => state.season],
  (season) => seasonCapabilities(season),
);

export const selectPlayoffStage = createSelector(
  [(state: RootState) => state.season.phase, (state: RootState) => state.season.playoffs],
  (phase, playoffs) => playoffStageFor(phase, playoffs ?? null),
);

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
                  } else if (game.scoreB > game.scoreA) {
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
                  } else if (game.scoreA > game.scoreB) {
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
        })).sort((a, b) => compareConferenceStanding(
            { record: a.record, name: a.team.schoolName },
            { record: b.record, name: b.team.schoolName },
        ));
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

        return rows.sort((a, b) => compareOverallStanding(
            { record: a.record, name: a.team.schoolName },
            { record: b.record, name: b.team.schoolName },
        ));
    }
);

/** League teams at their current prestige: ledger drift for CPU programs, career drift for the coached one. */
export const selectRankingTeams = createSelector(
  [
    selectTeams,
    (state: RootState) => state.season.programLedger,
    (state: RootState) => state.coach.selectedTeamId,
    (state: RootState) => state.coach.programPrestigeDrift,
  ],
  (teams, ledger, teamId, drift) => withLeaguePrestige(teams, ledger, teamId, drift ?? 0),
);

export const selectProgramLedger = (state: RootState): ProgramLedger => state.season.programLedger ?? {};

export const selectPollInputs = createSelector(
  [selectTeamRecords, (state: RootState) => state.season.gameResults],
  (records, gameResults) => computePollInputs(gameResults, records),
);

/** Every program in poll order. */
export const selectFullRankings = createSelector(
  [selectRankingTeams, selectTeamRecords, selectPollInputs],
  (teams, records, pollInputs) => computeRankings(teams, records, teams.length, pollInputs),
);

export const selectTop25Rankings = createSelector([selectFullRankings], (rankings) => rankings.slice(0, 25));

/** Each conference's champion: its tournament winner once the championships are played, else its table leader. */
export const selectConferenceLeaders = createSelector(
  [selectTeams, selectTeamRecords, (state: RootState) => state.season.conferenceTournaments],
  (teams, records, tournaments) => conferenceChampions(tournaments, conferenceLeaders(teams, records)),
);

/** The 12-team field if the season ended today: six auto bids for the best-ranked conference leaders, six at-large. */
export const selectTop12Projection = createSelector(
  [selectFullRankings, selectConferenceLeaders],
  (rankings, leaders) => buildPlayoffField(rankings, Object.values(leaders)),
);

/** The four best-ranked teams outside the projected field. */
export const selectFirstFourOut = createSelector(
  [selectFullRankings, selectTop12Projection],
  (rankings, field) => firstTeamsOut(rankings, field, 4),
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
      .map((team) => ({ team, record: records[team.id] ?? EMPTY_RECORD }))
      .sort((a, b) => compareConferenceStanding(
        { record: a.record, name: a.team.schoolName },
        { record: b.record, name: b.team.schoolName },
      ));
    const place = sorted.findIndex((row) => row.team.id === selectedTeamId) + 1;
    const userRec = records[selectedTeamId] ?? EMPTY_RECORD;
    return { place, total: confTeams.length, confWins: userRec.confWins, confLosses: userRec.confLosses };
  },
);
