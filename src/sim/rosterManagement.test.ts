import assert from 'node:assert';
import { describe, test } from 'node:test';
import type { Player, Position, SignedRecruit, Team } from '../types/sim.ts';
import {
  applyRosterTurnover,
  applyWeeklyTraitGrowth,
  developPlayers,
  trimRosterToTarget,
} from './rosterManagement.ts';
import { ROSTER_TARGET_SIZE } from './gameRules.ts';
import { generateRoster } from './generateRoster.ts';
import { makeRng } from './rng.ts';

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
});

const testTeam: Team = {
  id: 'team-turnover',
  schoolName: 'Harbor Point',
  nickname: 'Gales',
  conferenceId: 'conf-1',
  region: 'Northeast',
  prestige: 70,
};

function makeSignedClass(size: number): SignedRecruit[] {
  const positions: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
  return Array.from({ length: size }, (_, i) => ({
    recruitId: `sr-${i}`,
    signedAtYear: 2026,
    stars: 4,
    position: positions[i % positions.length],
    potential: 85,
  }));
}

function signedPlayerIdsFor(signed: SignedRecruit[]): Set<string> {
  return new Set(signed.map((recruit) => `${testTeam.id}-recruit-${recruit.recruitId}-yr1`));
}

describe('offseason roster turnover', () => {
  test('every signed recruit reaches the roster, even for a full class', () => {
    const roster = generateRoster(testTeam, 'league-season-2026');

    for (const classSize of [1, 6, 12]) {
      const signed = makeSignedClass(classSize);
      const next = applyRosterTurnover(roster, signed, testTeam, 2027);
      const expectedIds = signedPlayerIdsFor(signed);
      const landed = next.filter((player) => expectedIds.has(player.id));

      assert.strictEqual(
        landed.length,
        classSize,
        `class of ${classSize} lost ${classSize - landed.length} signees to roster trimming`,
      );
    }
  });

  test('turnover holds the roster target and a fieldable lineup at every position', () => {
    let roster = generateRoster(testTeam, 'league-season-2026');

    // Ten straight offseasons: graduation, transfers, and classes should not erode
    // the roster past what a starting lineup needs.
    for (let year = 0; year < 10; year += 1) {
      roster = applyRosterTurnover(roster, makeSignedClass(year % 4 === 0 ? 0 : 5), testTeam, 2027 + year);

      assert.ok(
        roster.length >= ROSTER_TARGET_SIZE,
        `year ${year} roster shrank to ${roster.length}`,
      );

      const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
      for (const player of roster) counts[player.position] += 1;
      assert.ok(counts.A >= 3, `year ${year} attack thin (${counts.A})`);
      assert.ok(counts.M >= 3, `year ${year} midfield thin (${counts.M})`);
      assert.ok(counts.D >= 3, `year ${year} defense thin (${counts.D})`);
      assert.ok(counts.LSM >= 1 && counts.FO >= 1 && counts.G >= 1, `year ${year} missing a specialist`);
      assert.ok(roster.every((player) => player.year >= 1 && player.year <= 4));
    }
  });

  test('turnover is deterministic for the same seed', () => {
    const roster = generateRoster(testTeam, 'league-season-2026');
    const signed = makeSignedClass(7);

    assert.deepStrictEqual(
      applyRosterTurnover(roster, signed, testTeam, 2031),
      applyRosterTurnover(roster, signed, testTeam, 2031),
    );
  });
});

describe('roster trimming', () => {
  test('protected players survive and cuts take the weakest first', () => {
    const overfull: Player[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ ...basePlayer(`star-${i}`), position: 'M' as const, overall: 88 })),
      ...Array.from({ length: 6 }, (_, i) => ({ ...basePlayer(`scrub-${i}`), position: 'M' as const, overall: 44 })),
      ...Array.from({ length: 4 }, (_, i) => ({ ...basePlayer(`d-${i}`), position: 'D' as const, overall: 70 })),
      { ...basePlayer('lsm'), position: 'LSM' as const },
      { ...basePlayer('fo'), position: 'FO' as const },
      { ...basePlayer('g'), position: 'G' as const },
      ...Array.from({ length: 3 }, (_, i) => ({ ...basePlayer(`a-${i}`), position: 'A' as const })),
    ];
    const protectedIds = new Set(['scrub-0', 'scrub-1']);

    const trimmed = trimRosterToTarget(overfull, protectedIds, 18);
    const trimmedIds = new Set(trimmed.map((player) => player.id));

    assert.strictEqual(trimmed.length, 18);
    for (const id of protectedIds) {
      assert.ok(trimmedIds.has(id), `protected player ${id} was cut`);
    }
    // Unprotected scrubs go before any 88-overall midfielder.
    assert.ok([...trimmedIds].filter((id) => id.startsWith('star-')).length === 6);
  });

  test('trimming never drops a position below its lineup minimum', () => {
    const thin: Player[] = [
      ...Array.from({ length: 14 }, (_, i) => ({ ...basePlayer(`m-${i}`), position: 'M' as const, overall: 60 })),
      ...Array.from({ length: 3 }, (_, i) => ({ ...basePlayer(`a-${i}`), position: 'A' as const, overall: 41 })),
      { ...basePlayer('g'), position: 'G' as const, overall: 40 },
    ];

    const trimmed = trimRosterToTarget(thin, new Set(), 12);
    const counts: Record<string, number> = {};
    for (const player of trimmed) counts[player.position] = (counts[player.position] ?? 0) + 1;

    assert.strictEqual(counts.A, 3, 'attack minimum must hold even though they are the weakest');
    assert.strictEqual(counts.G, 1, 'goalie must survive');
  });

  test('a roster already at or under target is returned untouched', () => {
    const roster = [basePlayer('p1'), basePlayer('p2')];
    assert.strictEqual(trimRosterToTarget(roster, new Set(), 5), roster);
  });
});
