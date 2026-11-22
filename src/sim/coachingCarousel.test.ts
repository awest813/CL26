import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import teamsData from '../data/teams128.json' with { type: 'json' };
import type { Team, TeamRecord } from '../types/sim.ts';
import {
  coachDevelopmentEdge,
  coachingTree,
  coachRecruitingPull,
  fillVacantPrograms,
  hotSeat,
  initialProgramCoaches,
  runCoachingCarousel,
  type CarouselInput,
} from './coachingCarousel.ts';
import { expectedWinsByTeamId } from './programLedger.ts';

const teams = teamsData.teams as Team[];
const byPrestige = [...teams].sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
const userTeamId = byPrestige[60].id;

/** A season where every program wins what it was expected to, except the ones named. */
function records(overrides: Record<string, number> = {}): Record<string, TeamRecord> {
  const expected = expectedWinsByTeamId(teams);
  return Object.fromEntries(teams.map((team) => {
    const wins = overrides[team.id] ?? Math.round(expected.get(team.id) ?? 6);
    return [team.id, { teamId: team.id, wins, losses: 12 - wins } as TeamRecord];
  }));
}

function carousel(extra: Partial<CarouselInput> = {}) {
  return runCoachingCarousel({
    coaches: initialProgramCoaches(teams, 2026, userTeamId),
    teams,
    records: records(),
    expectedWins: expectedWinsByTeamId(teams),
    championTeamId: byPrestige[0].id,
    year: 2026,
    seed: 2026,
    userTeamId,
    openings: new Set(),
    heldForUser: new Set(),
    assistantHires: [],
    ...extra,
  });
}

describe('coaching carousel', () => {
  test('every CPU program starts with a coach of its own, the same on every load', () => {
    const coaches = initialProgramCoaches(teams, 2026, userTeamId);
    assert.equal(Object.keys(coaches).length, teams.length - 1);
    assert.equal(coaches[userTeamId], undefined);
    assert.equal(new Set(Object.values(coaches).map((coach) => coach.name)).size, teams.length - 1);
    assert.deepEqual(initialProgramCoaches(teams, 2026, userTeamId), coaches);
    const top = coaches[byPrestige[0].id].rating;
    const bottom = coaches[byPrestige.at(-1)!.id].rating;
    assert.ok(top > bottom, `top program's coach ${top} vs bottom ${bottom}`);
  });

  test('a fired coach is replaced, and the seat a coach moves up from is filled too', () => {
    // A big job opens; a smaller program's coach just went 11-1.
    const bigJob = byPrestige[3].id;
    const riser = byPrestige[70].id;
    const result = carousel({ openings: new Set([bigJob]), records: records({ [bigJob]: 2, [riser]: 11 }) });
    assert.equal(Object.keys(result.coaches).length, teams.length - 1, 'every CPU seat is filled');
    const fired = result.news.find((move) => move.teamId === bigJob && move.kind !== 'hired');
    assert.equal(fired?.kind, 'fired');
    const hire = result.news.find((move) => move.teamId === bigJob && move.kind === 'hired');
    assert.ok(hire, 'the big job hires');
    if (hire?.background === 'head-coach') {
      assert.ok(hire.fromTeamId);
      assert.ok(result.news.some((move) => move.kind === 'hired' && move.teamId === hire.fromTeamId), 'his old seat is filled');
    }
    // Everyone else keeps his coach, a year older with the season on his record.
    const untouched = byPrestige[100].id;
    const before = initialProgramCoaches(teams, 2026, userTeamId)[untouched];
    assert.equal(result.coaches[untouched].name, before.name);
    assert.equal(result.coaches[untouched].age, before.age + 1);
    assert.equal(result.coaches[untouched].wins + result.coaches[untouched].losses, 12);
  });

  test('a winner at a smaller program moves up when a much bigger job opens', () => {
    const openings = new Set(byPrestige.slice(0, 6).map((team) => team.id));
    const winners = Object.fromEntries(byPrestige.slice(30, 60).map((team) => [team.id, 11]));
    const result = carousel({ openings, records: records({ ...winners, ...Object.fromEntries([...openings].map((id) => [id, 2])) }) });
    const moves = result.news.filter((move) => move.kind === 'hired' && move.background === 'head-coach');
    assert.ok(moves.length > 0, 'at least one head coach moved up');
    moves.forEach((move) => {
      const from = teams.find((team) => team.id === move.fromTeamId)!;
      const to = teams.find((team) => team.id === move.teamId)!;
      assert.ok(to.prestige >= from.prestige + 6, `${from.prestige} -> ${to.prestige}`);
    });
  });

  test('jobs that called the user wait for him; your assistant takes the job he was hired for', () => {
    const held = byPrestige[10].id;
    const assistantJob = byPrestige[40].id;
    const result = carousel({
      openings: new Set([held, assistantJob]),
      heldForUser: new Set([held]),
      assistantHires: [{ teamId: assistantJob, name: 'Pat Assistant', rating: 82, age: 41 }],
    });
    assert.equal(result.coaches[held], undefined);
    assert.equal(result.coaches[assistantJob].name, 'Pat Assistant');
    assert.equal(result.coaches[assistantJob].background, 'your-staff');
    assert.equal(result.coaches[assistantJob].fromTeamId, userTeamId);
    assert.deepEqual(coachingTree(result.coaches).map((row) => row.teamId), [assistantJob]);

    const next = fillVacantPrograms({ coaches: result.coaches, teams, userTeamId, year: 2027, seed: 2027 });
    assert.ok(next.coaches[held], 'the held job is filled when the season begins');
    assert.equal(next.coaches[held].hiredYear, 2027);
    assert.equal(Object.keys(next.coaches).length, teams.length - 1);
  });

  test('the program the user leaves gets a coach; the one he takes loses its', () => {
    const coaches = initialProgramCoaches(teams, 2026, userTeamId);
    const newJob = byPrestige[20].id;
    const next = fillVacantPrograms({ coaches, teams, userTeamId: newJob, year: 2027, seed: 1 });
    assert.equal(next.coaches[newJob], undefined);
    assert.ok(next.coaches[userTeamId], 'the old program hired');
  });

  test('the carousel is deterministic', () => {
    const openings = new Set(byPrestige.filter((_, index) => index % 9 === 0).map((team) => team.id));
    assert.deepEqual(carousel({ openings }), carousel({ openings }));
  });

  test('coach quality moves recruiting and development, centered on an average coach', () => {
    assert.equal(coachRecruitingPull(70), 1);
    assert.equal(coachDevelopmentEdge(70), 0);
    assert.ok(coachRecruitingPull(95) > 1.1 && coachRecruitingPull(45) < 0.9);
    assert.ok(coachDevelopmentEdge(95) > 0.5 && coachDevelopmentEdge(45) < -0.5);
    assert.equal(coachRecruitingPull(undefined), 1);
  });
});

describe('hot seat', () => {
  test('lists the coaches on pace to miss badly, hottest first, from four games in', () => {
    const coaches = initialProgramCoaches(teams, 2026, userTeamId);
    const expectedWins = expectedWinsByTeamId(teams);
    const top = byPrestige[0].id;
    const mid = byPrestige[50].id;
    const recordsAfter = (games: number, wins: Record<string, number>) => Object.fromEntries(teams.map((team) => {
      const w = wins[team.id] ?? Math.round(((expectedWins.get(team.id) ?? 6) * games) / 12);
      return [team.id, { teamId: team.id, wins: w, losses: games - w } as TeamRecord];
    }));
    assert.equal(hotSeat({ coaches, teams, records: recordsAfter(3, { [top]: 0 }), expectedWins }).length, 0, 'too early to tell');
    const list = hotSeat({ coaches, teams, records: recordsAfter(6, { [top]: 1, [mid]: 1 }), expectedWins });
    assert.equal(list[0].teamId, top, 'a top program at 1-5 is the hottest seat');
    assert.equal(list[0].heat, 'hot');
    assert.ok(list.some((entry) => entry.teamId === mid));
    assert.ok(list.every((entry) => entry.shortfall >= 2));
  });
});
