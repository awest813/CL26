import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
    buildPositionNeedByPosition,
    generateRecruitPool,
    generateSuitors,
    calculateTeamGrade,
    getTeamPitchGrade,
    estimateRecruitFit,
    isRecruitingPitch,
} from './recruiting.ts';
import type { Team, Recruit, RecruitingPitch } from '../types/sim.ts';

describe('Recruiting Logic', () => {
    test('generateRecruitPool creates recruits with motivations', () => {
        const pool = generateRecruitPool(2026);
        assert.ok(pool.length > 0);
        const recruit = pool[0];
        assert.ok(recruit.motivations.length === 3);
        assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(recruit.motivations[0].importance));
    });

    test('generateRecruitPool assigns dealbreakers roughly 10% of the time', () => {
        const pool = generateRecruitPool(12345, 1000); // 1000 recruits
        const dealbreakers = pool.filter(r => r.dealbreaker).length;
        // Expect ~100 dealbreakers (10%). Allow margin.
        assert.ok(dealbreakers > 50 && dealbreakers < 150, `Expected ~100 dealbreakers, got ${dealbreakers}`);
    });

    test('calculateTeamGrade returns correct grades', () => {
        const team = {
            prestige: 90,
            academicQuality: 90,
            facilities: 90,
            marketSize: 0, // irrelevant for most
            wins: 10, // irrelevant here
        } as unknown as Team;

        // PRESTIGE
        // >85 -> A+
        assert.strictEqual(calculateTeamGrade(team, 'PRESTIGE'), 'A+');

        // ACADEMIC
        // >80 -> A
        assert.strictEqual(calculateTeamGrade(team, 'ACADEMIC'), 'A');

        // CAMPUS_LIFE (facilities)
        // >85 -> B+ (hardcoded)
        assert.strictEqual(calculateTeamGrade(team, 'CAMPUS_LIFE'), 'B+');
    });

    test('calculateTeamGrade falls back to C for unexpected pitch values', () => {
        const team = {
            prestige: 65,
        } as Team;

        assert.strictEqual(calculateTeamGrade(team, 'NOT_A_PITCH' as unknown as RecruitingPitch), 'C');
    });

    test('getTeamPitchGrade maps to motivations correctly', () => {
         const team = {
            prestige: 90,
            region: 'Northeast'
        } as unknown as Team;

        const recruit = {
            region: 'Northeast', // Match -> Proximity A+
            motivations: [
                { pitch: 'PRESTIGE', importance: 'HIGH' }
            ]
        } as unknown as Recruit;

        // PROXIMITY -> A+ (same region)
        assert.strictEqual(getTeamPitchGrade(team, 'PROXIMITY', recruit), 'A+');

         // PRESTIGE -> A+ (90 > 85)
         assert.strictEqual(getTeamPitchGrade(team, 'PRESTIGE', recruit), 'A+');
     });

    test('getTeamPitchGrade delegates non-special pitches to calculateTeamGrade', () => {
        const team = {
            prestige: 65,
            region: 'South',
        } as Team;

        const recruit = {
            region: 'West',
            position: 'M',
        } as Recruit;

        assert.strictEqual(getTeamPitchGrade(team, 'ACADEMIC', recruit), calculateTeamGrade(team, 'ACADEMIC'));
    });

    test('playing time grade reflects positional roster need when available', () => {
        const team = {
            prestige: 85,
            region: 'Northeast',
        } as unknown as Team;

        const recruit = {
            position: 'FO',
            region: 'Northeast',
        } as Recruit;

        const needMap = buildPositionNeedByPosition([
            {
                id: 'p1',
                name: 'Goalie',
                position: 'G',
                year: 2,
                age: 19,
                skill: 70,
                shooting: 55,
                passing: 60,
                speed: 62,
                defense: 74,
                IQ: 70,
                stamina: 69,
                discipline: 71,
                overall: 66,
            },
        ]);

        assert.strictEqual(getTeamPitchGrade(team, 'PLAYING_TIME', recruit, needMap), 'A');
    });

    test('estimateRecruitFit includes motivations', () => {
        const team = {
            prestige: 90,
            state: 'MA'
        } as unknown as Team;

        const recruit = {
            homeState: 'MA',
            stars: 3,
            potential: 70,
            motivations: [
                { pitch: 'PRESTIGE', importance: 'HIGH' },
                { pitch: 'PROXIMITY', importance: 'MEDIUM' },
                { pitch: 'ACADEMIC', importance: 'LOW' }
            ]
        } as unknown as Recruit;

        // Should have a high fit because Prestige (High) is A and Proximity (Medium) is A
        const fit = estimateRecruitFit(recruit, team);
        assert.ok(fit > 60, `Expected high fit, got ${fit}`);
    });

    test('generateSuitors creates initial interest for CPU teams', async () => {
        const recruit = {
            id: 'r1',
            stars: 4,
            region: 'Northeast',
            motivations: []
        } as unknown as Recruit;

        const teams = [
            { id: 't1', prestige: 90, region: 'Northeast' },
            { id: 't2', prestige: 85, region: 'Northeast' },
            { id: 't3', prestige: 20, region: 'West' } // low fit
        ] as Team[];

        const { generateSuitors } = await import('./recruiting.ts');
        const result = generateSuitors(recruit, teams, 12345);

        // Expect t1 and t2 to be suitors, t3 likely not.
        // Note: With only 3 teams and random selection of 3-5, all might be selected.
        // Let's check that we have some suitors.
        assert.ok(Object.keys(result).length > 0, 'Should generate suitors');
    });

    test('generateSuitors uses per-recruit seed mixing for variety', () => {
        const teams = [
            { id: 't1', schoolName: 'A', nickname: 'A', conferenceId: 'c', region: 'East', prestige: 80 },
            { id: 't2', schoolName: 'B', nickname: 'B', conferenceId: 'c', region: 'East', prestige: 78 },
            { id: 't3', schoolName: 'C', nickname: 'C', conferenceId: 'c', region: 'West', prestige: 75 },
            { id: 't4', schoolName: 'D', nickname: 'D', conferenceId: 'c', region: 'West', prestige: 70 },
            { id: 't5', schoolName: 'E', nickname: 'E', conferenceId: 'c', region: 'South', prestige: 65 },
            { id: 't6', schoolName: 'F', nickname: 'F', conferenceId: 'c', region: 'Midwest', prestige: 60 },
        ] as Team[];

        const pool = generateRecruitPool(2026, 8);
        const suitorFingerprints = pool.map((recruit) =>
            JSON.stringify(Object.entries(generateSuitors(recruit, teams, 2026)).sort()),
        );
        const unique = new Set(suitorFingerprints);
        assert.ok(unique.size > 1, 'Different recruits should not share identical suitor maps');
    });

    test('isRecruitingPitch validates pitch keys', () => {
        assert.strictEqual(isRecruitingPitch('PRESTIGE'), true);
        assert.strictEqual(isRecruitingPitch(''), false);
        assert.strictEqual(isRecruitingPitch('NOT_A_PITCH'), false);
    });
});
