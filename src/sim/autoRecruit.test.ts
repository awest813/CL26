import { describe, test } from 'node:test';
import assert from 'node:assert';
import { planAutoRecruiting, type AutoRecruitInput } from './autoRecruit.ts';
import { buildPositionNeedByPosition, generateRecruitPool, generateSuitors, getTeamPitchGrade } from './recruiting.ts';
import { programPull, simulateRecruitingWeek } from './recruitingWeek.ts';
import { generateRoster } from './generateRoster.ts';
import teamsData from '../data/teams128.json' with { type: 'json' };
import type { Recruit, RecruitingPitch, Team } from '../types/sim.ts';

const teams = teamsData.teams as Team[];
const team: Team = { id: 'me', schoolName: 'Home State', nickname: 'Hawks', conferenceId: 'c1', region: 'Northeast', prestige: 70 };
const noNeed = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };

function recruit(id: string, overrides: Partial<Recruit> = {}): Recruit {
  return {
    id,
    name: id,
    position: 'M',
    stars: 3,
    region: 'Northeast',
    potential: 78,
    committedTeamId: null,
    motivations: [
      { pitch: 'PROXIMITY', importance: 'HIGH' },
      { pitch: 'ACADEMIC', importance: 'MEDIUM' },
      { pitch: 'CAMPUS_LIFE', importance: 'LOW' },
    ],
    dealbreaker: null,
    interestByTeamId: {},
    ...overrides,
  };
}

function input(overrides: Partial<AutoRecruitInput>): AutoRecruitInput {
  return {
    recruitPool: [],
    boardRecruitIds: [],
    team,
    positionNeedByPosition: noNeed,
    classNeedByPosition: { A: 2, M: 2, D: 2, LSM: 1, FO: 1, G: 1 },
    scholarshipsAvailable: 12,
    periodsLeft: 12,
    hoursCap: 120,
    maxHoursPerRecruit: 20,
    gainMultiplier: 1,
    ...overrides,
  };
}

describe('auto recruiting plan', () => {
  test('funds no more targets than open scholarships and stays under the caps', () => {
    const pool = Array.from({ length: 30 }, (_, i) => recruit(`r${i}`, { position: (['A', 'M', 'D'] as const)[i % 3] }));
    const committed = recruit('signed', { committedTeamId: 'me' });
    const plan = planAutoRecruiting(input({ recruitPool: [...pool, committed], scholarshipsAvailable: 4 }));

    const funded = Object.values(plan.hoursByRecruitId).filter((hours) => hours > 0);
    assert.ok(funded.length <= 3, `3 open scholarships, funded ${funded.length}`);
    assert.ok(funded.length > 0);
    assert.ok(funded.every((hours) => hours <= 20));
    assert.ok(funded.reduce((sum, hours) => sum + hours, 0) <= 120);
    assert.ok(plan.adds.length <= 25);
  });

  test('puts no hours anywhere once the class is full', () => {
    const pool = [recruit('open'), ...Array.from({ length: 2 }, (_, i) => recruit(`s${i}`, { committedTeamId: 'me' }))];
    const plan = planAutoRecruiting(input({ recruitPool: pool, boardRecruitIds: ['open'], scholarshipsAvailable: 2 }));
    assert.deepStrictEqual(plan.adds, []);
    assert.strictEqual(plan.hoursByRecruitId['open'], 0);
  });

  test('drops board targets who signed elsewhere and skips dealbreaker conflicts', () => {
    const lost = recruit('lost', { committedTeamId: 'rival' });
    const conflict = recruit('far', { region: 'West', dealbreaker: 'PROXIMITY', stars: 5 });
    const plan = planAutoRecruiting(input({ recruitPool: [lost, conflict, recruit('ok')], boardRecruitIds: ['lost'] }));
    assert.deepStrictEqual(plan.removals, ['lost']);
    assert.ok(!plan.adds.some((add) => add.recruitId === 'far'));
    assert.ok(plan.adds.some((add) => add.recruitId === 'ok'));
  });

  test('a prospect one push from committing gets only the hours needed', () => {
    const close = recruit('close', { interestByTeamId: { me: 96 } });
    const plan = planAutoRecruiting(input({ recruitPool: [close], boardRecruitIds: ['close'] }));
    assert.ok(plan.hoursByRecruitId['close'] > 0 && plan.hoursByRecruitId['close'] < 20, `got ${plan.hoursByRecruitId['close']}`);
  });

  test('a filled position stops drawing picks ahead of open ones', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => recruit(`g${i}`, { position: 'G', stars: 4 })),
      recruit('m', { position: 'M', stars: 3 }),
    ];
    const plan = planAutoRecruiting(input({
      recruitPool: pool,
      classNeedByPosition: { A: 0, M: 1, D: 0, LSM: 0, FO: 0, G: 1 },
      scholarshipsAvailable: 2,
    }));
    assert.deepStrictEqual(plan.priorityIds.slice(0, 2).sort(), ['g0', 'm'].sort());
  });

  test('a season on staff recruiting fills the class without overcommitting', () => {
    const sorted = [...teams].sort((a, b) => b.prestige - a.prestige);
    for (const me of [sorted[0], sorted[64]]) {
      const seed = 2026;
      const roster = generateRoster(me, seed);
      const needs = buildPositionNeedByPosition(roster);
      const profiles = Object.fromEntries(teams.map((t) => [t.id, { prestige: t.prestige, region: t.region }]));
      let pool = generateRecruitPool(seed).map((r) => ({ ...r, interestByTeamId: generateSuitors(r, teams, seed) }));
      let board: string[] = [];
      const pitches: Record<string, RecruitingPitch> = {};

      for (let week = 0; week < 12; week += 1) {
        const plan = planAutoRecruiting(input({
          recruitPool: pool,
          boardRecruitIds: board,
          team: me,
          positionNeedByPosition: needs,
          classNeedByPosition: buildPositionNeedByPosition(roster.filter((p) => p.year < 4)),
          periodsLeft: 12 - week,
        }));
        board = board.filter((id) => !plan.removals.includes(id));
        plan.adds.forEach(({ recruitId, startingInterest }) => {
          board.push(recruitId);
          pool = pool.map((r) => r.id === recruitId
            ? { ...r, interestByTeamId: { ...r.interestByTeamId, [me.id]: Math.max(r.interestByTeamId[me.id] ?? 0, startingInterest) } }
            : r);
        });
        Object.entries(plan.pitchByRecruitId).forEach(([id, pitch]) => {
          if (pitch) pitches[id] = pitch;
        });
        const grades = Object.fromEntries(board.filter((id) => pitches[id]).map((id) => {
          const r = pool.find((x) => x.id === id)!;
          return [id, getTeamPitchGrade(me, pitches[id], r, needs)];
        }));
        const result = simulateRecruitingWeek(pool, board, plan.hoursByRecruitId, pitches, grades, {}, {}, me.id, seed, week, 1, 72, profiles);
        pool = pool.map((r) => ({ ...r, interestByTeamId: result.interestByRecruitId[r.id], committedTeamId: result.committedTeamByRecruitId[r.id] }));
      }

      const signed = pool.filter((r) => r.committedTeamId === me.id);
      assert.ok(signed.length <= 12, `${me.id} overcommitted with ${signed.length}`);
      assert.ok(signed.length >= 9, `${me.id} (prestige ${me.prestige}) only closed ${signed.length}`);
      const byPosition = new Map<string, number>();
      signed.forEach((r) => byPosition.set(r.position, (byPosition.get(r.position) ?? 0) + 1));
      assert.ok(Math.max(...byPosition.values()) <= 4, `class piled up: ${JSON.stringify([...byPosition])}`);
    }
  });
});

describe('program pull', () => {
  test('a big name helps with blue chips, and a small one is a long shot', () => {
    assert.ok(programPull(90, 5) > programPull(50, 5));
    assert.strictEqual(programPull(48, 5), 0.5);
    assert.ok(programPull(90, 2) <= 1.15);
    assert.ok(programPull(60, 2) > programPull(60, 5));
  });
});
