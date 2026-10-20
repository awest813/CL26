import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSeasonJobMarket, FIRED_JOB_SECURITY } from './jobOffers.ts';
import type { Team } from '../types/sim.ts';

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

const teams = [team('user', 70), team('up', 88), team('peer', 70), team('down', 42), team('floor', 18)];

describe('season job market', () => {
  test('a strong season offers a step up and keeps the job', () => {
    const market = buildSeasonJobMarket({
      teams,
      userTeamId: 'user',
      seasonSeed: 3,
      year: 2026,
      jobSecurity: 74,
      champion: false,
      effectivePrestige: 70,
    });
    assert.equal(market.employment, 'ACTIVE');
    assert.equal(market.offers.length, 1);
    assert.equal(market.offers[0]?.teamId, 'up');
    assert.equal(market.offers[0]?.tier, 'UPGRADE');
  });

  test('a firing always includes a landing seat', () => {
    const market = buildSeasonJobMarket({
      teams,
      userTeamId: 'user',
      seasonSeed: 3,
      year: 2026,
      jobSecurity: FIRED_JOB_SECURITY - 1,
      champion: false,
      effectivePrestige: 70,
    });
    assert.equal(market.employment, 'FIRED');
    assert.ok(market.offers.length >= 1);
    const landing = teams.find((row) => row.id === market.offers[0]?.teamId);
    assert.ok(landing);
    assert.ok(landing.prestige <= 70);
    assert.notEqual(landing.id, 'user');
  });

  test('the lowest program still has somewhere to go', () => {
    const market = buildSeasonJobMarket({
      teams,
      userTeamId: 'floor',
      seasonSeed: 8,
      year: 2027,
      jobSecurity: 4,
      champion: false,
      effectivePrestige: 18,
    });
    assert.equal(market.employment, 'FIRED');
    assert.equal(market.offers.length, 1);
    assert.notEqual(market.offers[0]?.teamId, 'floor');
  });
});
