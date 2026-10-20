import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Player, Team } from '../types/sim.ts';
import {
  PRO_CLUBS,
  PRO_DRAFT_ROUNDS,
  buildCoachPool,
  buildPortalBoard,
  buildProDraft,
  entrantToPlayer,
} from './offseasonMarket.ts';

const teams: Team[] = Array.from({ length: 8 }, (_, index) => ({
  id: `t${index}`,
  schoolName: `School ${String.fromCharCode(65 + index)}`,
  nickname: 'Squad',
  conferenceId: 'c1',
  region: 'East',
  prestige: 40 + index * 7,
}));

const player = (id: string, overall: number, year: 1 | 2 | 3 | 4, name = id): Player => ({
  id,
  name,
  position: 'A',
  year,
  age: 17 + year,
  skill: overall,
  shooting: overall,
  passing: overall,
  speed: overall,
  defense: overall,
  IQ: overall,
  stamina: overall,
  discipline: overall,
  overall,
});

describe('offseason market', () => {
  test('portal and coach pool are deterministic', () => {
    const portalA = buildPortalBoard(teams, 't0', 2026, 2026);
    const portalB = buildPortalBoard(teams, 't0', 2026, 2026);
    assert.deepEqual(portalA, portalB);
    assert.equal(portalA.length, 7);
    assert.ok(portalA.every((entrant) => entrant.originTeamId !== 't0'));

    const coachesA = buildCoachPool(teams, 2026, 2026, 't0');
    const coachesB = buildCoachPool(teams, 2026, 2026, 't0');
    assert.deepEqual(coachesA, coachesB);
    assert.equal(coachesA.length, teams.length);
    assert.equal(coachesA.find((coach) => coach.teamId === 't0')?.hiring, false);
  });

  test('a portal entrant becomes a roster player with the same rating', () => {
    const [entrant] = buildPortalBoard(teams, 't3', 2027, 2027);
    const signed = entrantToPlayer(entrant);
    assert.equal(signed.id, entrant.id);
    assert.equal(signed.overall, entrant.overall);
    assert.equal(signed.year, entrant.year);
  });

  test('the pro draft takes the best college players and uses the coached roster', () => {
    const school: Team = { ...teams[0], id: 'hill', schoolName: 'Hilltop' };
    const roster = [
      player('star', 99, 4, 'Aaron Ace'),
      player('freshman', 99, 1, 'Too Young'),
      player('junior-low', 79, 3, 'Stays In School'),
      player('junior-pro', 91, 3, 'Early Entry'),
      player('senior-b', 84, 4, 'Second Senior'),
    ];
    const first = buildProDraft({
      teams: [school],
      rosterSeed: 'league-season-5',
      seasonSeed: 5,
      year: 2026,
      userTeamId: 'hill',
      userRoster: roster,
    });
    const second = buildProDraft({
      teams: [school],
      rosterSeed: 'league-season-5',
      seasonSeed: 5,
      year: 2026,
      userTeamId: 'hill',
      userRoster: roster,
    });
    assert.deepEqual(first, second);
    assert.deepEqual(first.map((pick) => pick.playerName), ['Aaron Ace', 'Early Entry', 'Second Senior']);
    assert.equal(first[0]?.pick, 1);
    assert.equal(first[0]?.round, 1);
    assert.equal(first[0]?.collegeName, 'Hilltop');
    assert.equal(first[1]?.early, true);
    assert.equal(first[2]?.early, false);
    assert.ok(PRO_CLUBS.some((club) => club.name === first[0]?.clubName));
  });

  test('eight clubs draft four rounds and the board never repeats a player', () => {
    const school: Team = { ...teams[0], id: 'factory', schoolName: 'Factory' };
    const roster = Array.from({ length: 40 }, (_, index) =>
      player(`p${index}`, 70 + (index % 25), 4, `Name ${String(index).padStart(2, '0')}`),
    );
    const picks = buildProDraft({
      teams: [school],
      rosterSeed: 'league-season-8',
      seasonSeed: 8,
      year: 2030,
      userTeamId: 'factory',
      userRoster: roster,
    });
    assert.equal(picks.length, PRO_CLUBS.length * PRO_DRAFT_ROUNDS);
    assert.equal(new Set(picks.map((pick) => pick.playerId)).size, picks.length);
    assert.ok(picks.every((pick, index) => pick.overall >= (picks[index + 1]?.overall ?? 0)));
    for (const club of PRO_CLUBS) {
      assert.equal(picks.filter((pick) => pick.clubId === club.id).length, PRO_DRAFT_ROUNDS);
    }
    assert.equal(picks[8]?.round, 2);
  });

  test('other colleges are in the pool alongside the coached roster', () => {
    const user: Team = { ...teams[0], id: 'user', schoolName: 'User', prestige: 40 };
    const cpu: Team = { ...teams[1], id: 'cpu', schoolName: 'State', prestige: 96 };
    const picks = buildProDraft({
      teams: [user, cpu],
      rosterSeed: 'league-season-9',
      seasonSeed: 9,
      year: 2026,
      userTeamId: 'user',
      userRoster: [player('local', 55, 4, 'Local Senior')],
    });
    assert.ok(picks.some((pick) => pick.collegeId === 'cpu'));
    assert.ok(picks[0] && picks[0].overall > 55);
  });
});
