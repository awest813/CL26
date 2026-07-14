import { describe, test } from 'node:test';
import assert from 'node:assert';
import { simulateRecruitingWeek } from './recruitingWeek.ts';
import type { Recruit } from '../types/sim.ts';

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

    test('CPU teams gain interest', () => {
        const recruit = mockRecruit('r1', { interestByTeamId: { 'cpu-1': 50, 'team-1': 50 } });
        const result = simulateRecruitingWeek(
            [recruit],
            [], // user ignores
            {}, {}, {}, {}, {},
            'team-1',
            12345,
            0
        );

        const cpuInterest = result.interestByRecruitId['r1']['cpu-1'];
        // CPU interest changes randomly, but shouldn't be exactly 50 usually
        assert.notEqual(cpuInterest, 50);
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
});
