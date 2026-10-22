import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  addGamesToSeasonStats,
  allAmericanTeams,
  LEADER_CATEGORIES,
  MIN_SHOTS_FACED,
  seasonAwards,
  seasonLeaders,
  storedGameResult,
} from './seasonStats.ts';
import { simulateGame } from './matchEngine.ts';
import { generateRoster } from './generateRoster.ts';
import { programStarters } from './programLedger.ts';
import { DEFAULT_TACTICS } from './tactics.ts';
import type { GameResult, PlayerSeasonLine, Team } from '../types/sim.ts';

const alpha: Team = { id: 'alpha', schoolName: 'Alpha State', nickname: 'Arrows', conferenceId: 'c1', region: 'East', prestige: 70 };
const beta: Team = { id: 'beta', schoolName: 'Beta Tech', nickname: 'Breakers', conferenceId: 'c2', region: 'West', prestige: 70 };
const rosterA = generateRoster(alpha, 'stats');
const rosterB = generateRoster(beta, 'stats');
const years = new Map([...rosterA, ...rosterB].map((player) => [player.id, player.year]));

function game(seed: number): GameResult {
  return simulateGame(
    { team: alpha, roster: rosterA, starterIds: programStarters(rosterA) },
    { team: beta, roster: rosterB, starterIds: programStarters(rosterB) },
    DEFAULT_TACTICS,
    DEFAULT_TACTICS,
    seed,
  );
}

describe('box scores', () => {
  test('add up to the team totals', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const result = game(seed);
      const box = result.boxScoreA ?? [];
      assert.strictEqual(box.reduce((sum, row) => sum + row.goals, 0), result.scoreA);
      assert.strictEqual(box.reduce((sum, row) => sum + row.saves, 0), result.statsA.saves);
      assert.strictEqual(box.reduce((sum, row) => sum + (row.groundBalls ?? 0), 0) <= result.statsA.groundBalls, true);
      const faceoffMan = box.find((row) => (row.faceoffsTaken ?? 0) > 0);
      assert.strictEqual(faceoffMan?.faceoffsTaken, result.statsA.faceoffsTaken);
      assert.strictEqual(faceoffMan?.faceoffWins, result.statsA.faceoffWins);
      const goalie = box.find((row) => row.goalsAllowed != null);
      assert.strictEqual(goalie?.goalsAllowed, result.scoreB);
    }
  });
});

describe('season totals', () => {
  test('sum every game a player appears in', () => {
    const results = [game(1), game(2), game(3)];
    const stats = addGamesToSeasonStats({}, results, years);
    const goalsA = results.reduce((sum, result) => sum + result.scoreA, 0);
    const alphaGoals = Object.values(stats).filter((line) => line.teamId === 'alpha').reduce((sum, line) => sum + line.goals, 0);
    assert.strictEqual(alphaGoals, goalsA);
    const again = addGamesToSeasonStats(stats, [game(4)], years);
    assert.notStrictEqual(again, stats, 'the old totals are not mutated');
    assert.ok(Object.values(again).some((line) => line.year >= 1 && line.year <= 4));
  });

  test('the save keeps full detail only for the user’s games', () => {
    const result = { ...game(5), highlights: Array.from({ length: 12 }, (_, i) => `line ${i}`) };
    const mine = storedGameResult(result, true);
    const theirs = storedGameResult(result, false);
    assert.strictEqual(mine.boxScoreA, undefined);
    assert.strictEqual(theirs.boxScoreB, undefined);
    assert.strictEqual(mine.highlights.length, 12);
    assert.strictEqual(theirs.highlights.length, 3);
    assert.ok(theirs.topPlayersA.length <= 2);
    assert.ok(theirs.topPlayersA.every((row) => row.shots === undefined));
  });
});

function line(overrides: Partial<PlayerSeasonLine>): PlayerSeasonLine {
  return {
    playerId: 'p', name: 'P', teamId: 't', position: 'A', year: 3,
    goals: 0, assists: 0, shots: 0, groundBalls: 0, causedTurnovers: 0, saves: 0, goalsAllowed: 0, faceoffWins: 0, faceoffsTaken: 0,
    ...overrides,
  };
}

describe('leaders and awards', () => {
  const stats = {
    star: line({ playerId: 'star', name: 'Star', goals: 40, assists: 20 }),
    feeder: line({ playerId: 'feeder', name: 'Feeder', goals: 10, assists: 45 }),
    pole: line({ playerId: 'pole', name: 'Pole', position: 'LSM', groundBalls: 70, causedTurnovers: 30 }),
    keeper: line({ playerId: 'keeper', name: 'Keeper', position: 'G', saves: 150, goalsAllowed: 110 }),
    backup: line({ playerId: 'backup', name: 'Backup', position: 'G', saves: 20, goalsAllowed: 5 }),
    fogo: line({ playerId: 'fogo', name: 'Fogo', position: 'FO', faceoffWins: 200, faceoffsTaken: 300, groundBalls: 90 }),
    rookie: line({ playerId: 'rookie', name: 'Rookie', year: 1, goals: 20, assists: 10 }),
  };

  test('rate leaders need enough attempts to qualify', () => {
    const savePct = LEADER_CATEGORIES.find((category) => category.key === 'savePct')!;
    const leaders = seasonLeaders(stats, savePct);
    assert.deepStrictEqual(leaders.map((row) => row.playerId), ['keeper'], `the backup faced fewer than ${MIN_SHOTS_FACED}`);
    const pointsLeaders = seasonLeaders(stats, LEADER_CATEGORIES[0], 2).map((row) => row.playerId);
    assert.deepStrictEqual(pointsLeaders, ['star', 'feeder']);
  });

  test('names a winner for each award', () => {
    const byAward = Object.fromEntries(seasonAwards(stats).map((award) => [award.award, award.playerId]));
    assert.deepStrictEqual(byAward, {
      'Player of the Year': 'star',
      'Goalie of the Year': 'keeper',
      'Defensive Player of the Year': 'pole',
      'Faceoff Specialist of the Year': 'fogo',
      'Freshman of the Year': 'rookie',
    });
  });

  test('an empty season names no one', () => {
    assert.deepStrictEqual(seasonAwards({}), []);
  });
});

describe('All-Americans', () => {
  test('fill a lineup on each team, best players first', () => {
    const results = Array.from({ length: 12 }, (_, i) => game(i + 1));
    const stats = addGamesToSeasonStats({}, results, years);
    // Two teams of 12 games cannot qualify a goalie or faceoff man on volume alone, so pad the qualifiers.
    const padded = Object.fromEntries(Object.entries(stats).map(([id, line]) => [
      id,
      line.position === 'G' ? { ...line, saves: line.saves + 200, goalsAllowed: line.goalsAllowed + 150 }
        : line.position === 'FO' ? { ...line, faceoffWins: line.faceoffWins + 100, faceoffsTaken: line.faceoffsTaken + 180 }
        : line,
    ]));
    const teams = allAmericanTeams(padded);
    const count = (rows: typeof teams.first, position: string) => rows.filter((row) => row.position === position).length;
    assert.strictEqual(count(teams.first, 'A'), 3);
    assert.strictEqual(count(teams.first, 'M'), 3);
    assert.strictEqual(count(teams.first, 'D'), 3);
    assert.strictEqual(count(teams.first, 'G'), 1);
    const firstIds = new Set(teams.first.map((row) => row.playerId));
    assert.ok(teams.second.every((row) => !firstIds.has(row.playerId)), 'nobody makes both teams');
    const attackPoints = (id: string) => (padded[id].goals + padded[id].assists);
    const worstFirstAttack = Math.min(...teams.first.filter((row) => row.position === 'A').map((row) => attackPoints(row.playerId)));
    const bestSecondAttack = Math.max(...teams.second.filter((row) => row.position === 'A').map((row) => attackPoints(row.playerId)));
    assert.ok(worstFirstAttack >= bestSecondAttack - 2, 'first-team attack should out-produce the second team');
  });
});
