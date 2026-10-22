import type { Conference, ConferenceTournament, ConferenceTournamentGame, Tactics, Team, TeamRecord, TeamSimInput } from '../types/sim';
import { simulateGame } from './matchEngine.ts';
import { seedToNumber } from './rng.ts';
import { compareConferenceStanding } from './standings.ts';

/**
 * Conference championships: after the regular season, the top four in each conference
 * table play a semifinal (1 v 4, 2 v 3) and a final, the higher seed hosting. The
 * winners are the conference champions the playoff field's automatic bids go to.
 */

/** Week keys on the injury timeline. */
export const CONFERENCE_SEMIFINAL_KEY = 'CONF_SEMI';
export const CONFERENCE_FINAL_KEY = 'CONF_FINAL';
export const CONFERENCE_TOURNAMENT_SIZE = 4;

/** Everything one side brings to a game: who plays and what they run. */
export interface TournamentSide {
  input: TeamSimInput;
  tactics: Tactics;
}

/** The conference's top four by the conference table. */
export function conferenceTournamentSeeds(
  conferenceTeams: Team[],
  recordsByTeamId: Record<string, TeamRecord>,
): string[] {
  const empty: TeamRecord = { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
  return conferenceTeams
    .map((team) => ({ id: team.id, record: recordsByTeamId[team.id] ?? empty, name: team.schoolName }))
    .sort(compareConferenceStanding)
    .slice(0, CONFERENCE_TOURNAMENT_SIZE)
    .map((row) => row.id);
}

function playGame(
  id: string,
  round: ConferenceTournamentGame['round'],
  homeTeamId: string,
  awayTeamId: string,
  homeSeed: number,
  awaySeed: number,
  sideFor: (teamId: string, weekKey: string) => TournamentSide,
  seasonSeed: number,
): ConferenceTournamentGame {
  const weekKey = round === 'SEMIFINAL' ? CONFERENCE_SEMIFINAL_KEY : CONFERENCE_FINAL_KEY;
  const home = sideFor(homeTeamId, weekKey);
  const away = sideFor(awayTeamId, weekKey);
  const result = simulateGame(home.input, away.input, home.tactics, away.tactics, seedToNumber(JSON.stringify([seasonSeed, id, homeTeamId, awayTeamId])));
  return {
    id,
    round,
    homeTeamId,
    awayTeamId,
    homeSeed,
    awaySeed,
    homeScore: result.scoreA,
    awayScore: result.scoreB,
    winnerTeamId: result.scoreA > result.scoreB ? homeTeamId : awayTeamId,
  };
}

/** Play every conference's championship. `sideFor` supplies each team's lineup and scheme for a game. */
export function playConferenceTournaments(input: {
  teams: Team[];
  conferences: Conference[];
  recordsByTeamId: Record<string, TeamRecord>;
  seasonSeed: number;
  sideFor: (teamId: string, weekKey: string) => TournamentSide;
}): Record<string, ConferenceTournament> {
  const tournaments: Record<string, ConferenceTournament> = {};
  for (const conference of input.conferences) {
    const seeds = conferenceTournamentSeeds(
      input.teams.filter((team) => team.conferenceId === conference.id),
      input.recordsByTeamId,
    );
    if (seeds.length < CONFERENCE_TOURNAMENT_SIZE) continue;

    const semifinals = [
      playGame(`${conference.id}-semi-1`, 'SEMIFINAL', seeds[0], seeds[3], 1, 4, input.sideFor, input.seasonSeed),
      playGame(`${conference.id}-semi-2`, 'SEMIFINAL', seeds[1], seeds[2], 2, 3, input.sideFor, input.seasonSeed),
    ];
    const finalists = semifinals
      .map((game) => ({ teamId: game.winnerTeamId, seed: seeds.indexOf(game.winnerTeamId) + 1 }))
      .sort((a, b) => a.seed - b.seed);
    const final = playGame(
      `${conference.id}-final`,
      'FINAL',
      finalists[0].teamId,
      finalists[1].teamId,
      finalists[0].seed,
      finalists[1].seed,
      input.sideFor,
      input.seasonSeed,
    );

    tournaments[conference.id] = {
      conferenceId: conference.id,
      seeds,
      games: [...semifinals, final],
      championTeamId: final.winnerTeamId,
    };
  }
  return tournaments;
}

/** The champion of each conference: the tournament winner once it is played, else the table leader. */
export function conferenceChampions(
  tournaments: Record<string, ConferenceTournament> | null | undefined,
  leaders: Record<string, string>,
): Record<string, string> {
  if (!tournaments || Object.keys(tournaments).length === 0) return leaders;
  return { ...leaders, ...Object.fromEntries(Object.values(tournaments).map((t) => [t.conferenceId, t.championTeamId])) };
}

/** A program's run through its conference tournament, if it made it. */
export function tournamentRunFor(
  tournaments: Record<string, ConferenceTournament> | null | undefined,
  teamId: string,
): { tournament: ConferenceTournament; seed: number; games: ConferenceTournamentGame[] } | null {
  for (const tournament of Object.values(tournaments ?? {})) {
    const index = tournament.seeds.indexOf(teamId);
    if (index < 0) continue;
    return {
      tournament,
      seed: index + 1,
      games: tournament.games.filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId),
    };
  }
  return null;
}
