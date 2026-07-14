import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRoster } from './generateRoster.ts';
import {
  buildPlayoffState,
  homeAwayByTournamentSeed,
  selectPlayoffField,
  simulatePlayoffRound,
  type PlayoffCoachContext,
} from './playoffs.ts';
import type { RankingRow, Team } from '../types/sim.ts';

function createTeams(count = 12): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    schoolName: `School ${index + 1}`,
    nickname: `Nick ${index + 1}`,
    conferenceId: `conf-${Math.floor(index / 8) + 1}`,
    region: 'National',
    prestige: 90 - index,
  }));
}

function createTop12Rankings(): RankingRow[] {
  return Array.from({ length: 12 }, (_, index) => ({
    rank: index + 1,
    teamId: `team-${index + 1}`,
    rating: 100 - index,
    record: `${12 - index}-0`,
    trend: 'same',
  }));
}

describe('playoff loop', () => {
  test('selectPlayoffField maps rankings to 1..12 seeds', () => {
    const field = selectPlayoffField(createTop12Rankings());

    assert.equal(field.length, 12);
    assert.deepEqual(field[0], { seed: 1, teamId: 'team-1' });
    assert.deepEqual(field[11], { seed: 12, teamId: 'team-12' });
  });

  test('buildPlayoffState creates round-1 pairings and empty later rounds', () => {
    const state = buildPlayoffState(selectPlayoffField(createTop12Rankings()));

    assert.equal(state.currentRound, 'ROUND1');
    assert.equal(state.rounds.ROUND1.length, 4);
    assert.equal(state.rounds.QUARTERFINAL.length, 0);
    assert.equal(state.rounds.SEMIFINAL.length, 0);
    assert.equal(state.rounds.FINAL.length, 0);
    assert.equal(state.rounds.ROUND1[0].homeSeed, 5);
    assert.equal(state.rounds.ROUND1[0].awaySeed, 12);
  });

  test('homeAwayByTournamentSeed puts the better seed at home', () => {
    const seedByTeamId = new Map([
      ['team-3', 3],
      ['team-8', 8],
    ]);
    const matchup = homeAwayByTournamentSeed('team-8', 'team-3', seedByTeamId);
    assert.equal(matchup.homeTeamId, 'team-3');
    assert.equal(matchup.awayTeamId, 'team-8');
    assert.equal(matchup.homeSeed, 3);
    assert.equal(matchup.awaySeed, 8);
  });

  test('quarterfinals place top-4 bye hosts against correct Round 1 winners', () => {
    const teams = createTeams(12);
    const seeds = selectPlayoffField(createTop12Rankings());
    let state = buildPlayoffState(seeds);
    state = simulatePlayoffRound(state, teams, 4242);

    assert.equal(state.currentRound, 'QUARTERFINAL');
    assert.equal(state.rounds.QUARTERFINAL.length, 4);

    const qf = state.rounds.QUARTERFINAL;
    const r1 = state.rounds.ROUND1;
    assert.equal(qf[0].homeTeamId, 'team-1');
    assert.equal(qf[0].awayTeamId, r1.find((g) => g.slot === 4)?.winnerTeamId);
    assert.equal(qf[1].homeTeamId, 'team-4');
    assert.equal(qf[1].awayTeamId, r1.find((g) => g.slot === 1)?.winnerTeamId);
    assert.equal(qf[2].homeTeamId, 'team-2');
    assert.equal(qf[2].awayTeamId, r1.find((g) => g.slot === 3)?.winnerTeamId);
    assert.equal(qf[3].homeTeamId, 'team-3');
    assert.equal(qf[3].awayTeamId, r1.find((g) => g.slot === 2)?.winnerTeamId);
  });

  test('semifinals and final host by tournament seed, not bracket slot order', () => {
    const teams = createTeams(12);
    const seeds = selectPlayoffField(createTop12Rankings());
    const seedByTeamId = new Map(seeds.map((seed) => [seed.teamId, seed.seed]));

    let state = buildPlayoffState(seeds);
    state = simulatePlayoffRound(state, teams, 1111);
    state = simulatePlayoffRound(state, teams, 1111);

    assert.equal(state.currentRound, 'SEMIFINAL');
    for (const game of state.rounds.SEMIFINAL) {
      assert.ok(
        game.homeSeed < game.awaySeed,
        `SF slot ${game.slot}: home seed ${game.homeSeed} should beat away ${game.awaySeed}`,
      );
      assert.equal(game.homeSeed, seedByTeamId.get(game.homeTeamId));
      assert.equal(game.awaySeed, seedByTeamId.get(game.awayTeamId));
    }

    state = simulatePlayoffRound(state, teams, 1111);
    assert.equal(state.currentRound, 'FINAL');
    const final = state.rounds.FINAL[0];
    assert.ok(final.homeSeed < final.awaySeed);
    assert.equal(final.homeSeed, seedByTeamId.get(final.homeTeamId));
  });

  test('simulatePlayoffRound applies coach tactics when coach context is provided', () => {
    const teams = createTeams(12);
    const seeds = selectPlayoffField(createTop12Rankings());
    const coach: PlayoffCoachContext = {
      teamId: 'team-5',
      roster: generateRoster(teams[4], 'test-roster'),
      starterIds: [],
      tactics: {
        tempo: 'fast',
        rideClear: 'aggressive',
        slideAggression: 'aggressive',
        offenseSet: 'motion',
        defensePackage: 'zone',
      },
    };

    let state = buildPlayoffState(seeds);
    state = simulatePlayoffRound(state, teams, 5555, 'test-roster', coach);
    const r1Game = state.rounds.ROUND1.find((g) => g.homeTeamId === 'team-5' || g.awayTeamId === 'team-5');
    assert.ok(r1Game?.result, 'coach team Round 1 game should simulate');
  });

  test('simulatePlayoffRound advances through full bracket and produces champion deterministically', () => {
    const teams = createTeams(12);
    const seeds = selectPlayoffField(createTop12Rankings());
    const seedByTeamId = new Map(seeds.map((seed) => [seed.teamId, seed.seed]));

    const runBracket = () => {
      let state = buildPlayoffState(seeds);
      state = simulatePlayoffRound(state, teams, 98765);
      assert.equal(state.currentRound, 'QUARTERFINAL');
      assert.equal(state.rounds.ROUND1.every((game) => !!game.winnerTeamId), true);
      assert.equal(state.rounds.QUARTERFINAL.length, 4);

      state = simulatePlayoffRound(state, teams, 98765);
      assert.equal(state.currentRound, 'SEMIFINAL');
      assert.equal(state.rounds.SEMIFINAL.length, 2);
      assert.ok(state.rounds.SEMIFINAL.every((game) => game.homeSeed === seedByTeamId.get(game.homeTeamId) && game.awaySeed === seedByTeamId.get(game.awayTeamId)));
      assert.ok(state.rounds.SEMIFINAL.every((game) => game.homeSeed < game.awaySeed));

      state = simulatePlayoffRound(state, teams, 98765);
      assert.equal(state.currentRound, 'FINAL');
      assert.equal(state.rounds.FINAL.length, 1);
      assert.equal(state.championTeamId, null);
      assert.ok(state.rounds.FINAL.every((game) => game.homeSeed === seedByTeamId.get(game.homeTeamId) && game.awaySeed === seedByTeamId.get(game.awayTeamId)));
      assert.ok(state.rounds.FINAL.every((game) => game.homeSeed < game.awaySeed));

      state = simulatePlayoffRound(state, teams, 98765);
      assert.equal(state.currentRound, 'FINAL');
      assert.notEqual(state.championTeamId, null);
      return state;
    };

    const first = runBracket();
    const second = runBracket();

    assert.equal(second.championTeamId, first.championTeamId);
    assert.deepEqual(second.rounds.FINAL[0].result, first.rounds.FINAL[0].result);
  });

  test('simulatePlayoffRound prevents resimulating a completed round or completed bracket', () => {
    const teams = createTeams(12);
    const seeds = selectPlayoffField(createTop12Rankings());

    const initial = buildPlayoffState(seeds);
    const afterRound1 = simulatePlayoffRound(initial, teams, 12345);
    const staleRoundPointer = { ...afterRound1, currentRound: 'ROUND1' as const };

    assert.throws(() => simulatePlayoffRound(staleRoundPointer, teams, 12345), /already been simulated/);

    let complete = buildPlayoffState(seeds);
    complete = simulatePlayoffRound(complete, teams, 12345);
    complete = simulatePlayoffRound(complete, teams, 12345);
    complete = simulatePlayoffRound(complete, teams, 12345);
    complete = simulatePlayoffRound(complete, teams, 12345);

    assert.throws(() => simulatePlayoffRound(complete, teams, 12345), /already complete/);
  });
});
