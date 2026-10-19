import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Team } from '../types/sim.ts';
import {
  DRAFT_BOARD_SIZE,
  buildCoachPool,
  buildDraftBoard,
  buildPortalBoard,
  draftPickIndex,
  entrantToPlayer,
  prospectsAvailableAtPick,
} from './offseasonMarket.ts';

const teams: Team[] = Array.from({ length: 8 }, (_, index) => ({
  id: `t${index}`,
  schoolName: `School ${String.fromCharCode(65 + index)}`,
  nickname: 'Squad',
  conferenceId: 'c1',
  region: 'East',
  prestige: 40 + index * 7,
}));

describe('offseason market', () => {
  test('portal, draft, and coach pool are deterministic', () => {
    const portalA = buildPortalBoard(teams, 't0', 2026, 2026);
    const portalB = buildPortalBoard(teams, 't0', 2026, 2026);
    assert.deepEqual(portalA, portalB);
    assert.equal(portalA.length, 7);
    assert.ok(portalA.every((entrant) => entrant.originTeamId !== 't0'));

    const draftA = buildDraftBoard(2030, 2030);
    const draftB = buildDraftBoard(2030, 2030);
    assert.deepEqual(draftA, draftB);
    assert.equal(draftA.length, DRAFT_BOARD_SIZE);

    const coachesA = buildCoachPool(teams, 2026, 2026, 't0');
    const coachesB = buildCoachPool(teams, 2026, 2026, 't0');
    assert.deepEqual(coachesA, coachesB);
    assert.equal(coachesA.length, teams.length);
    assert.equal(coachesA.find((coach) => coach.teamId === 't0')?.hiring, false);
  });

  test('a later draft pick cannot take a name already off the board', () => {
    const board = buildDraftBoard(2040, 2040);
    const first = prospectsAvailableAtPick(board, 0);
    const later = prospectsAvailableAtPick(board, 10);
    assert.equal(first.length, DRAFT_BOARD_SIZE);
    assert.equal(later.length, DRAFT_BOARD_SIZE - 10);
    assert.ok(!later.some((prospect) => prospect.id === first[0]?.id));
  });

  test('fewer wins pick earlier in the supplemental draft', () => {
    const records = {
      t0: { wins: 11, losses: 1, pointsFor: 140, pointsAgainst: 90 },
      t1: { wins: 2, losses: 10, pointsFor: 80, pointsAgainst: 150 },
    };
    assert.ok(draftPickIndex('t1', teams, records) < draftPickIndex('t0', teams, records));
  });

  test('a portal entrant becomes a roster player with the same rating', () => {
    const [entrant] = buildPortalBoard(teams, 't3', 2027, 2027);
    const player = entrantToPlayer(entrant);
    assert.equal(player.id, entrant.id);
    assert.equal(player.overall, entrant.overall);
    assert.equal(player.year, entrant.year);
  });
});
