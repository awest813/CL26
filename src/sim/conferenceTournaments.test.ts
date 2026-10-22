import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  conferenceChampions,
  conferenceTournamentSeeds,
  playConferenceTournaments,
  tournamentRunFor,
  type TournamentSide,
} from './conferenceTournaments.ts';
import { generateRoster } from './generateRoster.ts';
import { programStarters } from './programLedger.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import type { Conference, Team, TeamRecord } from '../types/sim.ts';

const conferences: Conference[] = [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }];
const teams: Team[] = Array.from({ length: 16 }, (_, index) => ({
  id: `t${index}`,
  schoolName: `School ${index}`,
  nickname: 'Team',
  conferenceId: index < 8 ? 'c1' : 'c2',
  region: 'East',
  prestige: 60 + (index % 8) * 3,
}));
// Conference record falls with the index inside each conference: t0 and t8 lead.
const records: Record<string, TeamRecord> = Object.fromEntries(teams.map((team, index) => {
  const confWins = 7 - (index % 8);
  return [team.id, { wins: confWins + 3, losses: 9 - confWins, confWins, confLosses: 7 - confWins, pointsFor: 100, pointsAgainst: 100 }];
}));

function sideFor(teamId: string): TournamentSide {
  const team = teams.find((row) => row.id === teamId) as Team;
  const roster = generateRoster(team, 'tournament');
  return { input: { team, roster, starterIds: programStarters(roster) }, tactics: DEFAULT_TACTICS };
}

describe('conference championships', () => {
  test('the top four in the conference table get in, in order', () => {
    assert.deepStrictEqual(conferenceTournamentSeeds(teams.slice(0, 8), records), ['t0', 't1', 't2', 't3']);
  });

  test('1 plays 4, 2 plays 3, and the better remaining seed hosts the final', () => {
    const tournaments = playConferenceTournaments({ teams, conferences, recordsByTeamId: records, seasonSeed: 7, sideFor });
    assert.deepStrictEqual(Object.keys(tournaments).sort(), ['c1', 'c2']);
    for (const tournament of Object.values(tournaments)) {
      const [semi1, semi2, final] = tournament.games;
      assert.deepStrictEqual([semi1.homeSeed, semi1.awaySeed, semi2.homeSeed, semi2.awaySeed], [1, 4, 2, 3]);
      assert.strictEqual(final.round, 'FINAL');
      assert.ok(final.homeSeed < final.awaySeed);
      assert.deepStrictEqual(new Set([final.homeTeamId, final.awayTeamId]), new Set([semi1.winnerTeamId, semi2.winnerTeamId]));
      assert.strictEqual(tournament.championTeamId, final.winnerTeamId);
      for (const game of tournament.games) assert.notStrictEqual(game.homeScore, game.awayScore);
    }
  });

  test('the same season plays out the same way', () => {
    const first = playConferenceTournaments({ teams, conferences, recordsByTeamId: records, seasonSeed: 7, sideFor });
    const second = playConferenceTournaments({ teams, conferences, recordsByTeamId: records, seasonSeed: 7, sideFor });
    assert.deepStrictEqual(first, second);
  });

  test('tournament winners replace the table leaders as champions', () => {
    const tournaments = playConferenceTournaments({ teams, conferences, recordsByTeamId: records, seasonSeed: 7, sideFor });
    const leaders = { c1: 't0', c2: 't8' };
    assert.deepStrictEqual(conferenceChampions(null, leaders), leaders);
    const champions = conferenceChampions(tournaments, leaders);
    assert.strictEqual(champions.c1, tournaments.c1.championTeamId);
  });

  test('finds a program’s run, and nothing for a program that missed it', () => {
    const tournaments = playConferenceTournaments({ teams, conferences, recordsByTeamId: records, seasonSeed: 7, sideFor });
    const run = tournamentRunFor(tournaments, 't1');
    assert.ok(run);
    assert.strictEqual(run.seed, 2);
    assert.ok(run.games.length >= 1 && run.games.length <= 2);
    assert.strictEqual(tournamentRunFor(tournaments, 't6'), null);
  });
});
