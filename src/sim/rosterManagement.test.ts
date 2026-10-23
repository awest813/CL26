import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Player, Position, SignedRecruit, Team } from '../types/sim.ts';
import { applyRosterTurnover, applyWeeklyTraitGrowth, convertRecruitToPlayer, developPlayers, previewOffseasonDepartures } from './rosterManagement.ts';
import { makeRng } from './rng.ts';
import leagueData from '../data/teams128.json' with { type: 'json' };
import { generateRoster } from './generateRoster.ts';

const basePlayer = (id: string): Player => ({
  id,
  name: `Player ${id}`,
  position: 'M',
  year: 2,
  age: 19,
  skill: 70,
  shooting: 70,
  passing: 70,
  speed: 70,
  defense: 70,
  IQ: 70,
  stamina: 70,
  discipline: 70,
  overall: 70,
});

describe('roster management progression systems', () => {
  test('weekly trait growth is deterministic for same seed/week/focus', () => {
    const roster = [basePlayer('p1'), basePlayer('p2'), basePlayer('p3')];
    const first = applyWeeklyTraitGrowth(roster, 2027, 3, 'OFFENSE', {
      developmentSkill: 2,
      facilitiesLevel: 68,
      coachSkill: 78,
    });
    const second = applyWeeklyTraitGrowth(roster, 2027, 3, 'OFFENSE', {
      developmentSkill: 2,
      facilitiesLevel: 68,
      coachSkill: 78,
    });
    assert.deepStrictEqual(first, second);
  });

  test('offense focus prioritizes shooting/passing over defense', () => {
    const roster = Array.from({ length: 8 }, (_, i) => basePlayer(`off-${i}`));
    const grown = applyWeeklyTraitGrowth(roster, 4040, 4, 'OFFENSE', {
      developmentSkill: 3,
      facilitiesLevel: 72,
      coachSkill: 82,
    });
    const totalShootGain = grown.reduce((sum, p) => sum + (p.shooting - 70), 0);
    const totalPassGain = grown.reduce((sum, p) => sum + (p.passing - 70), 0);
    const totalDefenseGain = grown.reduce((sum, p) => sum + (p.defense - 70), 0);
    assert.ok(totalShootGain + totalPassGain >= totalDefenseGain);
  });

  test('facilities and development skill raise offseason growth ceiling', () => {
    const roster = Array.from({ length: 10 }, (_, i) => ({
      ...basePlayer(`dev-${i}`),
      year: 1 as const,
    }));
    const lowSupport = developPlayers(roster, makeRng(111), {
      coachArchetype: 'RECRUITER',
      developmentSkill: 0,
      facilitiesLevel: 35,
      operationsSkill: 0,
      boostersLevel: 40,
    });
    const highSupport = developPlayers(roster, makeRng(111), {
      coachArchetype: 'DEVELOPER',
      developmentSkill: 4,
      facilitiesLevel: 90,
      operationsSkill: 3,
      boostersLevel: 85,
    });

    const lowOverallGain = lowSupport.reduce((sum, p) => sum + (p.overall - 70), 0);
    const highOverallGain = highSupport.reduce((sum, p) => sum + (p.overall - 70), 0);
    assert.ok(highOverallGain >= lowOverallGain);
  });

  test('a player with room under his potential outgrows one already at his ceiling', () => {
    const support = { coachArchetype: 'DEVELOPER' as const, developmentSkill: 3, facilitiesLevel: 70, operationsSkill: 2, boostersLevel: 70 };
    const roster = (potential: number) => Array.from({ length: 30 }, (_, i) => ({ ...basePlayer(`pot-${potential}-${i}`), year: 1 as const, potential }));
    const capped = developPlayers(roster(70), makeRng(333), support);
    const roomy = developPlayers(roster(88), makeRng(333), support);
    const gain = (players: typeof capped) => players.reduce((sum, p) => sum + (p.overall - 70), 0);
    assert.equal(gain(capped), 0, 'a player at his ceiling should not grow');
    assert.ok(gain(roomy) > 30, `players with room grew only ${gain(roomy)} in total`);
  });

  test('offseason development soft-caps elite attributes', () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...basePlayer(`cap-${i}`),
      year: 1 as const,
      shooting: 91,
      passing: 91,
      speed: 91,
      defense: 91,
      IQ: 91,
      stamina: 91,
      discipline: 91,
      overall: 91,
      skill: 91,
    }));
    const grown = developPlayers(roster, makeRng(222), {
      coachArchetype: 'DEVELOPER',
      developmentSkill: 5,
      facilitiesLevel: 95,
      operationsSkill: 5,
      boostersLevel: 95,
    });
    assert.ok(grown.every((player) => player.overall <= 94));
    assert.ok(grown.every((player) => player.shooting <= 93));
  });

  test('a full signing class still keeps a walk-on at a graduated position', () => {
    const team: Team = {
      id: 't-goalie',
      schoolName: 'Test',
      nickname: 'Tests',
      conferenceId: 'c1',
      region: 'East',
      prestige: 70,
    };
    const roster: Player[] = [
      ...Array.from({ length: 16 }, (_, index) => ({
        ...basePlayer(`return-a-${index}`),
        position: 'A' as Position,
        year: 2 as const,
        overall: 60 + (index % 5),
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        ...basePlayer(`return-d-${index}`),
        position: 'D' as Position,
        year: 2 as const,
        overall: 64,
      })),
      { ...basePlayer('return-lsm'), position: 'LSM' as Position, year: 2 as const },
      { ...basePlayer('return-fo'), position: 'FO' as Position, year: 2 as const },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...basePlayer(`senior-m-${index}`),
        position: 'M' as Position,
        year: 4 as const,
      })),
      {
        ...basePlayer('only-goalie'),
        position: 'G' as Position,
        year: 4 as const,
        overall: 80,
      },
    ];
    const signed: SignedRecruit[] = Array.from({ length: 12 }, (_, index) => ({
      recruitId: `sig-${index}`,
      signedAtYear: 2026,
      stars: 3,
      position: 'A' as Position,
      potential: 70,
    }));

    const next = applyRosterTurnover(roster, signed, team, 2027);
    const ids = new Set(next.map((player) => player.id));
    const count = (position: Position) => next.filter((player) => player.position === position).length;
    assert.ok(next.length <= 32, `roster grew to ${next.length}`);
    assert.ok(next.length >= 12, `roster shrank to ${next.length}`);
    assert.strictEqual(ids.size, next.length, 'roster has duplicate player ids');
    // Two deep behind every starting spot.
    assert.ok(count('G') >= 2, 'graduated goalie was not replaced two deep');
    assert.ok(count('M') >= 6, `midfield depth ${count('M')} cannot field two lines`);
    assert.ok(count('A') >= 6);
    assert.ok(count('D') >= 6);
    assert.ok(count('LSM') >= 2);
    assert.ok(count('FO') >= 2);
  });

  test('portal additions do not change who leaves', () => {
    const team: Team = {
      id: 't-portal',
      schoolName: 'Test',
      nickname: 'Tests',
      conferenceId: 'c1',
      region: 'East',
      prestige: 55,
    };
    const roster = [
      { ...basePlayer('senior'), year: 4 as const, position: 'A' as const },
      { ...basePlayer('junior'), year: 3 as const, position: 'M' as const },
      { ...basePlayer('sophomore'), year: 2 as const, position: 'D' as const },
      { ...basePlayer('freshman'), year: 1 as const, position: 'G' as const },
    ];
    const addition = { ...basePlayer('portal-1'), name: 'Portal Player', position: 'A' as const, overall: 90 };
    const plain = applyRosterTurnover(roster, [], team, 3030);
    const withAdd = applyRosterTurnover(roster, [], team, 3030, undefined, [addition]);
    const left = previewOffseasonDepartures(roster, team, 3030).map((departure) => departure.player.id);
    assert.ok(left.includes('senior'));
    for (const id of left) {
      assert.ok(!plain.some((player) => player.id === id));
      assert.ok(!withAdd.some((player) => player.id === id));
    }
    assert.ok(withAdd.some((player) => player.id === 'portal-1'));
  });

  test('a drafted junior turns pro without changing the other departures', () => {
    const team: Team = {
      id: 't-pro',
      schoolName: 'Test',
      nickname: 'Tests',
      conferenceId: 'c1',
      region: 'East',
      prestige: 55,
    };
    const roster = [
      { ...basePlayer('senior'), year: 4 as const, position: 'A' as const },
      { ...basePlayer('junior'), year: 3 as const, position: 'M' as const, overall: 88 },
      { ...basePlayer('sophomore'), year: 2 as const, position: 'D' as const },
      { ...basePlayer('freshman'), year: 1 as const, position: 'G' as const },
    ];
    const plain = applyRosterTurnover(roster, [], team, 4040);
    const withPro = applyRosterTurnover(roster, [], team, 4040, undefined, [], ['junior']);
    const left = previewOffseasonDepartures(roster, team, 4040).map((departure) => departure.player.id);
    for (const id of left) {
      assert.ok(!plain.some((player) => player.id === id));
      assert.ok(!withPro.some((player) => player.id === id));
    }
    assert.ok(!withPro.some((player) => player.id === 'junior'));
    if (!left.includes('junior')) {
      assert.ok(plain.some((player) => player.id === 'junior'));
    }
  });

  test('a signed recruit joins the roster under the name he signed with, and his ratings do not change for it', () => {
    const team = { id: 'tm', schoolName: 'T', nickname: 'T', conferenceId: 'c', region: 'North', prestige: 70 } as Team;
    const signed: SignedRecruit = { recruitId: 'r1', signedAtYear: 2026, stars: 4, position: 'M', potential: 88 };
    const unnamed = convertRecruitToPlayer(signed, team, makeRng(7));
    const named = convertRecruitToPlayer({ ...signed, name: 'Logan Hayes' }, team, makeRng(7));
    assert.strictEqual(named.name, 'Logan Hayes');
    assert.deepStrictEqual({ ...named, name: '' }, { ...unnamed, name: '' });
  });

  test('filling a position below its minimum cuts returning depth, never a new signee', () => {
    const team = (leagueData.teams as Team[])[5];
    // Every goalie graduates and the class brings only one, so the staff must make room for a walk-on goalie.
    const roster = generateRoster(team, 'x').map((player) =>
      player.position === 'G' ? { ...player, year: 4 as const } : { ...player, year: Math.min(player.year, 3) as Player['year'] });
    const positions: Position[] = ['A', 'M', 'D', 'M', 'A', 'D', 'M', 'LSM', 'FO', 'A', 'M', 'G'];
    for (let seed = 1; seed <= 12; seed += 1) {
      const signed: SignedRecruit[] = positions.map((position, i) => ({
        recruitId: `r${i}`, name: `Signee ${i}`, signedAtYear: 2026, stars: 2, position, potential: 70,
      }));
      const next = applyRosterTurnover(roster, signed, team, seed);
      const names = new Set(next.map((player) => player.name));
      assert.deepStrictEqual(signed.filter((row) => !names.has(row.name!)).map((row) => row.position), [], `seed ${seed}`);
      assert.ok(next.filter((player) => player.position === 'G').length >= 2, `seed ${seed} goalies`);
    }
  });
});
