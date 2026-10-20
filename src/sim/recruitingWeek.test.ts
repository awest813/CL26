import { describe, test } from 'node:test';
import assert from 'node:assert';
import { CPU_CLASS_CAP, cpuWeeklyPursuit, simulateRecruitingWeek } from './recruitingWeek.ts';
import { generateRecruitPool, generateSuitors } from './recruiting.ts';
import teamsData from '../data/teams128.json' with { type: 'json' };
import type { Recruit, Team } from '../types/sim.ts';

describe('Recruiting Week Simulation', () => {
    const mockRecruit = (id: string, overrides: Partial<Recruit> = {}): Recruit => ({
        id,
        name: 'Test Recruit',
        position: 'A',
        stars: 3,
        region: 'Northeast',
        potential: 80,
        committedTeamId: null,
        motivations: [
            { pitch: 'PLAYING_TIME', importance: 'HIGH' },
            { pitch: 'PROXIMITY', importance: 'MEDIUM' },
            { pitch: 'ACADEMIC', importance: 'LOW' }
        ],
        dealbreaker: null,
        ...overrides
    });

    test('Interest increases with hours allocated (User)', () => {
        const recruit = mockRecruit('r1', { interestByTeamId: { 'team-1': 50 } });
        const result = simulateRecruitingWeek(
            [recruit],
            ['r1'], // on board
            { 'r1': 10 }, // 10 hours
            {},
            {},
            {},
            {},
            'team-1',
            12345,
            0
        );

        const newInterest = result.interestByRecruitId['r1']['team-1'];
        assert.ok(newInterest > 50, `Interest should increase (got ${newInterest})`);
    });

    test('Interest decays when not on board (User)', () => {
        const recruit = mockRecruit('r1', { interestByTeamId: { 'team-1': 50 } });
        const result = simulateRecruitingWeek(
            [recruit],
            [], // NOT on board
            {},
            {},
            {},
            {},
            {},
            'team-1',
            12345,
            0
        );

        const newInterest = result.interestByRecruitId['r1']['team-1'];
        assert.strictEqual(newInterest, 48, `Interest should decay by 2 (got ${newInterest})`);
    });

    test('Dealbreaker violation causes interest loss', () => {
        const recruit = mockRecruit('r1', { dealbreaker: 'PROXIMITY', interestByTeamId: { 'team-1': 50 } });
        const result = simulateRecruitingWeek(
            [recruit],
            ['r1'],
            { 'r1': 20 }, // Max hours
            {},
            {},
            { 'r1': true }, // VIOLATION
            {},
            'team-1',
            12345,
            0
        );

        const newInterest = result.interestByRecruitId['r1']['team-1'];
        // 20 hours still produce gain; dealbreaker subtracts 5 instead of wiping the week.
        assert.ok(newInterest > 50, `Interest should still rise with hours despite dealbreaker (got ${newInterest})`);
        assert.ok(newInterest < 65, `Dealbreaker should blunt the week (got ${newInterest})`);
    });

    test('B+ pitch grade outperforms C grade for the same pitch and hours', () => {
        const recruit = mockRecruit('r1', {
            interestByTeamId: { 'team-1': 40 },
            motivations: [
                { pitch: 'CAMPUS_LIFE', importance: 'HIGH' },
                { pitch: 'PROXIMITY', importance: 'MEDIUM' },
                { pitch: 'ACADEMIC', importance: 'LOW' },
            ],
        });

        const withBPlus = simulateRecruitingWeek(
            [recruit],
            ['r1'],
            { 'r1': 10 },
            { 'r1': 'CAMPUS_LIFE' },
            { 'r1': 'B+' },
            {},
            {},
            'team-1',
            12345,
            0,
        );

        const withC = simulateRecruitingWeek(
            [recruit],
            ['r1'],
            { 'r1': 10 },
            { 'r1': 'CAMPUS_LIFE' },
            { 'r1': 'C' },
            {},
            {},
            'team-1',
            12345,
            0,
        );

        assert.ok(
            withBPlus.interestByRecruitId['r1']['team-1'] > withC.interestByRecruitId['r1']['team-1'],
            'B+ should provide a larger recruiting gain than C',
        );
    });

    test('CPU teams gain interest over a stretch of weeks', () => {
        let recruit = mockRecruit('r1', { interestByTeamId: { 'cpu-1': 50, 'team-1': 50 } });
        for (let week = 0; week < 4; week += 1) {
            const result = simulateRecruitingWeek([recruit], [], {}, {}, {}, {}, {}, 'team-1', 12345, week);
            recruit = { ...recruit, interestByTeamId: result.interestByRecruitId['r1'] };
        }
        assert.ok(recruit.interestByTeamId['cpu-1'] > 50, `CPU interest should climb (got ${recruit.interestByTeamId['cpu-1']})`);
    });

    test('Commitment triggers at 100 interest', () => {
        const recruit = mockRecruit('r1', { interestByTeamId: { 'team-1': 95 } });
        const result = simulateRecruitingWeek(
            [recruit],
            ['r1'],
            { 'r1': 20 }, // plenty of hours
            {},
            {},
            {},
            {},
            'team-1',
            12345,
            0
        );

        const newInterest = result.interestByRecruitId['r1']['team-1'];
        const committed = result.committedTeamByRecruitId['r1'];

        assert.ok(newInterest >= 100, 'Interest should reach 100');
        assert.strictEqual(committed, 'team-1', 'Recruit should commit to team-1');
    });

    test('CPU wins if they hit 100 first', () => {
        const recruit = mockRecruit('r1', { interestByTeamId: { 'cpu-1': 99, 'team-1': 50 } });
        // User ignores, CPU is at 99. CPU should likely commit.
        // We need a seed where CPU gains points.
        const result = simulateRecruitingWeek(
            [recruit],
            [],
            {}, {}, {}, {}, {},
            'team-1',
            12345,
            0
        );

        const cpuInterest = result.interestByRecruitId['r1']['cpu-1'];
        if (cpuInterest >= 100) {
            assert.strictEqual(result.committedTeamByRecruitId['r1'], 'cpu-1');
        }
    });

    test('CPU commits a meaningful share of the class across a 12-week season', () => {
        const teams = teamsData.teams as Team[];
        const profiles = Object.fromEntries(teams.map((t) => [t.id, { prestige: t.prestige, region: t.region }]));
        const seed = 2026;
        const userTeamId = teams[60].id;
        let pool = generateRecruitPool(seed).map((r) => ({ ...r, interestByTeamId: generateSuitors(r, teams, seed) }));
        let firstCommitWeek = -1;

        for (let week = 0; week < 12; week += 1) {
            const result = simulateRecruitingWeek(pool, [], {}, {}, {}, {}, {}, userTeamId, seed, week, 1, 72, profiles);
            pool = pool.map((r) => ({
                ...r,
                interestByTeamId: result.interestByRecruitId[r.id],
                committedTeamId: result.committedTeamByRecruitId[r.id],
            }));
            if (firstCommitWeek < 0 && pool.some((r) => r.committedTeamId)) firstCommitWeek = week;
        }

        const committed = pool.filter((r) => r.committedTeamId);
        assert.ok(committed.length >= 40, `CPU should land real commits (got ${committed.length})`);
        assert.ok(committed.length <= 130, `Some of the class should still be open (got ${committed.length})`);
        assert.ok(firstCommitWeek >= 2 && firstCommitWeek <= 7, `Commits should start mid-cycle (week ${firstCommitWeek})`);

        const blueChips = pool.filter((r) => r.stars >= 4);
        const blueChipRate = blueChips.filter((r) => r.committedTeamId).length / blueChips.length;
        const depth = pool.filter((r) => r.stars === 2);
        const depthRate = depth.filter((r) => r.committedTeamId).length / depth.length;
        assert.ok(blueChipRate > depthRate, 'Blue chips should come off the board faster than depth recruits');

        const classSizes = new Map<string, number>();
        committed.forEach((r) => classSizes.set(r.committedTeamId!, (classSizes.get(r.committedTeamId!) ?? 0) + 1));
        classSizes.forEach((size, teamId) => {
            assert.ok(size <= CPU_CLASS_CAP, `${teamId} signed ${size} over the CPU class cap`);
        });
    });

    test('Hours on one target do not change CPU outcomes for another', () => {
        const a = mockRecruit('ra', { interestByTeamId: { 'cpu-1': 40, 'cpu-2': 35 } });
        const b = mockRecruit('rb', { interestByTeamId: { 'cpu-1': 30, 'team-1': 20 } });
        const idle = simulateRecruitingWeek([a, b], [], {}, {}, {}, {}, {}, 'team-1', 77, 3);
        const busy = simulateRecruitingWeek([a, b], ['rb'], { rb: 20 }, {}, {}, {}, {}, 'team-1', 77, 3);
        assert.deepStrictEqual(busy.interestByRecruitId['ra'], idle.interestByRecruitId['ra']);
        assert.strictEqual(busy.interestByRecruitId['rb']['cpu-1'], idle.interestByRecruitId['rb']['cpu-1']);
    });

    test('A CPU program with a full class cannot take another commit', () => {
        const full = Array.from({ length: CPU_CLASS_CAP }, (_, i) =>
            mockRecruit(`signed-${i}`, { committedTeamId: 'cpu-1', interestByTeamId: { 'cpu-1': 100 } }),
        );
        const open = mockRecruit('open', { interestByTeamId: { 'cpu-1': 100 } });
        const result = simulateRecruitingWeek([...full, open], [], {}, {}, {}, {}, {}, 'team-1', 5, 4);
        assert.strictEqual(result.committedTeamByRecruitId['open'], null);
        assert.ok(result.interestByRecruitId['open']['cpu-1'] < 100, 'A full staff backs off the prospect');
    });

    test('Elite nearby programs pursue harder than distant low-prestige ones', () => {
        const recruit = mockRecruit('r1', { stars: 4, region: 'Northeast' });
        const elite = cpuWeeklyPursuit(recruit, { prestige: 88, region: 'Northeast' });
        const distant = cpuWeeklyPursuit(recruit, { prestige: 52, region: 'West' });
        assert.ok(elite > distant * 2, `elite ${elite} vs distant ${distant}`);
    });
});
