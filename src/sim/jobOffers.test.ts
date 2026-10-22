import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSeasonJobMarket, FIRED_JOB_SECURITY, programOpenings, seasonResultFor } from './jobOffers.ts';
import type { Team, TeamRecord } from '../types/sim.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };

function team(id: string, prestige: number): Team {
  return {
    id,
    schoolName: id,
    nickname: 'Club',
    conferenceId: 'c',
    region: 'East',
    prestige,
  };
}

const teams = [team('user', 70), team('reach', 80), team('up', 88), team('step', 74), team('peer', 70), team('down', 42), team('floor', 18)];

const base = {
  teams,
  userTeamId: 'user',
  seasonSeed: 3,
  year: 2026,
  effectivePrestige: 70,
};

describe('season job market', () => {
  test('hitting the win target draws one call, a small step up', () => {
    const market = buildSeasonJobMarket({ ...base, jobSecurity: 70, champion: false, wins: 8, winTarget: 7 });
    assert.equal(market.employment, 'ACTIVE');
    assert.deepEqual(market.offers.map((offer) => offer.teamId), ['step']);
    assert.equal(market.offers[0]?.tier, 'UPGRADE');
  });

  test('a playoff run reaches further and draws two calls', () => {
    const market = buildSeasonJobMarket({ ...base, jobSecurity: 70, champion: false, madePlayoffs: true, wins: 9, winTarget: 7 });
    assert.deepEqual(market.offers.map((offer) => offer.teamId), ['reach', 'step']);
  });

  test('a title reaches the top program', () => {
    const market = buildSeasonJobMarket({ ...base, jobSecurity: 50, champion: true });
    assert.equal(market.offers[0]?.teamId, 'up');
    assert.equal(market.offers.length, 3);
  });

  test('a losing season draws nothing, and only open jobs call', () => {
    assert.equal(buildSeasonJobMarket({ ...base, jobSecurity: 70, champion: false, wins: 4, winTarget: 7 }).offers.length, 0);
    const market = buildSeasonJobMarket({
      ...base, jobSecurity: 70, champion: false, madePlayoffs: true, wins: 9, winTarget: 7, openings: new Set(['peer']),
    });
    assert.deepEqual(market.offers.map((offer) => offer.teamId), ['peer']);
    assert.equal(market.offers[0]?.tier, 'LATERAL');
  });

  test('a firing always includes a landing seat at or below the old one', () => {
    const market = buildSeasonJobMarket({ ...base, jobSecurity: FIRED_JOB_SECURITY - 1, champion: false });
    assert.equal(market.employment, 'FIRED');
    assert.equal(market.offers.length, 1);
    const landing = teams.find((row) => row.id === market.offers[0]?.teamId);
    assert.ok(landing && landing.prestige <= 70 && landing.id !== 'user');
  });

  test('the lowest program still has somewhere to go, even with no openings below it', () => {
    const market = buildSeasonJobMarket({
      ...base, userTeamId: 'floor', effectivePrestige: 18, jobSecurity: 4, champion: false, openings: new Set(['up']),
    });
    assert.equal(market.employment, 'FIRED');
    assert.deepEqual(market.offers.map((offer) => offer.teamId), ['up']);
    assert.equal(market.offers[0]?.tier, 'LATERAL');
  });

  test('a season counts as a title, a playoff run, a met target, or nothing', () => {
    assert.equal(seasonResultFor({ champion: true, madePlayoffs: true, wins: 3, winTarget: 9, jobSecurity: 10 }), 'champion');
    assert.equal(seasonResultFor({ champion: false, madePlayoffs: true, wins: 9, winTarget: 7, jobSecurity: 59 }), null);
    assert.equal(seasonResultFor({ champion: false, madePlayoffs: false, wins: 7, winTarget: 7, jobSecurity: 65 }), 'targetMet');
  });
});

describe('program openings', () => {
  test('programs that badly miss open far more often than ones that win', () => {
    const league = leagueData.teams as Team[];
    const record = (wins: number): TeamRecord => ({ wins, losses: 12 - wins, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 });
    let missedOpen = 0;
    let wonOpen = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const sorted = [...league].sort((a, b) => b.prestige - a.prestige);
      const records = Object.fromEntries(sorted.map((row, index) => [row.id, record(index < 64 ? 2 : 11)]));
      const openings = programOpenings({ teams: league, records, seasonSeed: seed, year: 2026, userTeamId: sorted[0].id });
      assert.ok(!openings.has(sorted[0].id), 'the user program is never open');
      missedOpen += sorted.slice(1, 64).filter((row) => openings.has(row.id)).length;
      wonOpen += sorted.slice(64).filter((row) => openings.has(row.id)).length;
    }
    assert.ok(missedOpen > wonOpen * 5, `missed ${missedOpen}, won ${wonOpen}`);
  });
});
