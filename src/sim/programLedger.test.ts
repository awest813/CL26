import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  draftLedger,
  advanceProgramLedger,
  MAX_PRESTIGE_DRIFT,
  MAX_TALENT,
  prestigeDriftForSeason,
  programRoster,
  programStarters,
  withLeaguePrestige,
} from './programLedger.ts';
import { generateRoster } from './generateRoster.ts';
import { simulateGame } from './matchEngine.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import type { PlayoffState, ProgramLedger, Team, TeamRecord } from '../types/sim.ts';

function makeTeam(id: string, prestige: number): Team {
  return { id, schoolName: `School ${id}`, nickname: 'Team', conferenceId: 'c1', region: 'East', prestige };
}

function record(wins: number): TeamRecord {
  return { wins, losses: 12 - wins, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
}

const league = Array.from({ length: 16 }, (_, index) => makeTeam(`t${index}`, 50 + index * 2));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const rosterOverall = (team: Team, ledger: ProgramLedger | undefined, seed: string) =>
  average(programRoster(team, ledger, seed).map((player) => player.overall));

/** One neutral season: every program wins what its prestige rank predicts and signs nobody. */
function neutralSeason(ledger: ProgramLedger | undefined, overrides: Partial<Parameters<typeof advanceProgramLedger>[0]> = {}) {
  const ordered = [...withLeaguePrestige(league, ledger)].sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
  const recordsByTeamId = Object.fromEntries(
    ordered.map((team, rank) => [team.id, record(Math.round(10 - (8 * rank) / (ordered.length - 1)))]),
  );
  return advanceProgramLedger({
    ledger,
    teams: league,
    recordsByTeamId,
    playoffs: null,
    classStarsByTeamId: {},
    earlyEntrantsByTeamId: {},
    year: 2026,
    ...overrides,
  });
}

describe('prestige drift for a season', () => {
  test('rewards titles and bracket runs, punishes big misses', () => {
    assert.strictEqual(prestigeDriftForSeason(true, true, 0), 4);
    assert.strictEqual(prestigeDriftForSeason(false, true, -3), 2);
    assert.strictEqual(prestigeDriftForSeason(false, false, 0), 1);
    assert.strictEqual(prestigeDriftForSeason(false, false, -1), 0);
    assert.strictEqual(prestigeDriftForSeason(false, false, -2), -2);
    assert.strictEqual(prestigeDriftForSeason(false, false, -5), -3);
  });

  test('a win-now program only earns prestige for a final-four run', () => {
    assert.strictEqual(prestigeDriftForSeason(true, true, 0, 'CONTENDER', true), 4);
    assert.strictEqual(prestigeDriftForSeason(false, true, 0, 'CONTENDER', true), 2);
    assert.strictEqual(prestigeDriftForSeason(false, true, 2, 'CONTENDER', false), 0);
    assert.strictEqual(prestigeDriftForSeason(false, false, 0, 'CONTENDER'), -1);
    assert.strictEqual(prestigeDriftForSeason(false, false, -2, 'CONTENDER'), -3);
  });
});

describe('league prestige', () => {
  test('applies ledger drift to CPU programs and the coach drift to the user program', () => {
    const ledger: ProgramLedger = { t0: { prestigeDrift: 6, talent: 0 }, t1: { prestigeDrift: 9, talent: 0 } };
    const teams = withLeaguePrestige(league, ledger, 't1', -4);
    assert.strictEqual(teams[0].prestige, 56);
    assert.strictEqual(teams[1].prestige, 48, 'the user program uses its career drift, not the ledger');
    assert.strictEqual(teams[2], league[2]);
  });

  test('returns the same array when nothing moved', () => {
    assert.strictEqual(withLeaguePrestige(league, {}), league);
    assert.strictEqual(withLeaguePrestige(league, undefined, 't0', 0), league);
  });
});

describe('program rosters', () => {
  test('a program with no ledger entry plays its generated roster', () => {
    assert.deepStrictEqual(programRoster(league[3], {}, 'roster-seed'), generateRoster(league[3], 'roster-seed'));
  });

  test('builds a roster once per season and standing', () => {
    const ledger: ProgramLedger = { t4: { prestigeDrift: 2, talent: 1.5 } };
    assert.strictEqual(programRoster(league[4], ledger, 'cache-seed'), programRoster(league[4], ledger, 'cache-seed'));
    const roster = programRoster(league[4], ledger, 'cache-seed');
    assert.strictEqual(programStarters(roster), programStarters(roster));
  });

  test('talent and earned prestige both lift the roster', () => {
    const base = rosterOverall(league[5], {}, 'lift');
    assert.ok(rosterOverall(league[5], { t5: { prestigeDrift: 0, talent: 4 } }, 'lift') > base + 3);
    assert.ok(rosterOverall(league[5], { t5: { prestigeDrift: 10, talent: 0 } }, 'lift') > base + 3);
  });
});

describe('advancing the ledger', () => {
  test('a champion gains prestige and a collapse loses it', () => {
    const playoffs = { seeds: [{ seed: 1, teamId: 't3' }], championTeamId: 't3' } as unknown as PlayoffState;
    const base = neutralSeason(undefined, { playoffs });
    assert.strictEqual(base.t3.prestigeDrift, 4);

    const ordered = [...league].sort((a, b) => b.prestige - a.prestige);
    const collapse = neutralSeason(undefined, {
      recordsByTeamId: Object.fromEntries(ordered.map((team) => [team.id, record(team.id === 't15' ? 1 : 6)])),
    });
    assert.strictEqual(collapse.t15.prestigeDrift, -3, 'the top program went 1-11');
  });

  test('earned prestige fades back toward the base in a neutral year', () => {
    const next = neutralSeason({ t2: { prestigeDrift: 10, talent: 0 } });
    // 10 × 0.9 = 9, plus the +1 for meeting expectations.
    assert.strictEqual(next.t2.prestigeDrift, 10);
    const quiet = neutralSeason({ t2: { prestigeDrift: 10, talent: 0 } }, {
      recordsByTeamId: Object.fromEntries(league.map((team) => [team.id, record(team.id === 't2' ? 2 : 6)])),
    });
    assert.ok(quiet.t2.prestigeDrift < 10);
  });

  test('a class above what the program usually signs adds talent; early pros take it away', () => {
    const classStarsByTeamId = Object.fromEntries(league.map((team) => [team.id, [3, 3, 3]]));
    classStarsByTeamId.t6 = [5, 5, 5, 5, 5, 5, 5, 5];
    const next = neutralSeason(undefined, { classStarsByTeamId, earlyEntrantsByTeamId: { t7: 3 } });
    assert.ok(next.t6.talent > 3, `talent ${next.t6.talent}`);
    assert.ok(next.t7.talent < 0);
    assert.deepStrictEqual(next.t6.lastClass, { year: 2026, commits: 8, averageStars: 5 });
  });

  test('leaves the user program alone and keeps every value in bounds', () => {
    let ledger: ProgramLedger | undefined;
    const classStarsByTeamId = { t1: Array(8).fill(5), t9: Array(8).fill(5) };
    const playoffs = { seeds: [{ seed: 1, teamId: 't1' }, { seed: 2, teamId: 't9' }], championTeamId: 't1' } as unknown as PlayoffState;
    for (let year = 0; year < 15; year += 1) {
      ledger = neutralSeason(ledger, { classStarsByTeamId, playoffs, userTeamId: 't9' });
    }
    assert.ok(ledger);
    assert.strictEqual(ledger.t9, undefined);
    assert.ok(ledger.t1.prestigeDrift <= MAX_PRESTIGE_DRIFT);
    assert.ok(ledger.t1.talent <= MAX_TALENT);
  });

  test('three straight top classes make a program better than its old peers', () => {
    const climber = league[4];
    const peer = league[5];
    let ledger: ProgramLedger | undefined;
    for (let year = 0; year < 3; year += 1) {
      const classStarsByTeamId = Object.fromEntries(league.map((team) => [team.id, [3, 3, 3, 2]]));
      classStarsByTeamId[climber.id] = Array(8).fill(5);
      ledger = neutralSeason(ledger, { classStarsByTeamId, year: 2026 + year });
    }

    const climberRoster = programRoster(climber, ledger, 'climb');
    const peerRoster = programRoster(peer, ledger, 'climb');
    let wins = 0;
    const games = 300;
    for (let seed = 1; seed <= games; seed += 1) {
      const result = simulateGame(
        { team: climber, roster: climberRoster, starterIds: programStarters(climberRoster) },
        { team: peer, roster: peerRoster, starterIds: programStarters(peerRoster) },
        DEFAULT_TACTICS,
        DEFAULT_TACTICS,
        seed,
        { homeAdvantageForA: seed % 2 === 0 },
      );
      if (result.scoreA > result.scoreB) wins += 1;
    }
    // Before the classes, the climber was the weaker of the two (prestige 58 against 60).
    assert.ok(wins / games > 0.6, `climber won ${wins} of ${games}`);
  });
});

describe('the pro draft ledger', () => {
  test('stays on the pre-season ledger once the season is folded in', () => {
    const before: ProgramLedger = { a: { prestigeDrift: 1, talent: 60 } } as unknown as ProgramLedger;
    const after: ProgramLedger = { a: { prestigeDrift: 5, talent: 64 } } as unknown as ProgramLedger;
    assert.strictEqual(draftLedger({ year: 2026, programLedger: before, programLedgerYear: 2025 }), before);
    assert.strictEqual(draftLedger({ year: 2026, programLedger: after, programLedgerYear: 2026, programLedgerBefore: before }), before);
    assert.strictEqual(draftLedger({ year: 2027, programLedger: after, programLedgerYear: 2026, programLedgerBefore: before }), after);
  });
});
