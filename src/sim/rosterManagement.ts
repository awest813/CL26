import { Player, Position, Recruit, Team } from '../types/sim';
import { makeRng, randInt } from './rng';

const FIRST_NAMES = ['Alex', 'Jordan', 'Casey', 'Riley', 'Evan', 'Taylor', 'Cameron', 'Parker', 'Drew', 'Logan', 'Avery', 'Blake', 'Sam', 'Chris', 'Pat', 'Morgan', 'Devin', 'Jesse', 'Skylar', 'Dakota', 'Quinn', 'Reese', 'Rowan', 'Sage'];
const LAST_NAMES = ['Hale', 'Turner', 'Bennett', 'Sloan', 'Miller', 'Frost', 'Donovan', 'Chase', 'Brooks', 'Keller', 'Pryor', 'Hayes', 'Carter', 'Reed', 'Ross', 'Ward', 'Foster', 'Long', 'Price', 'Gray', 'Sanders', 'Ross', 'Myers', 'Ford', 'Hamilton'];

const clamp = (value: number) => Math.max(40, Math.min(99, value));

// Helper to generate a random player name
function generateName(seed: number): string {
    const rng = makeRng(seed);
    return `${FIRST_NAMES[randInt(rng, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[randInt(rng, 0, LAST_NAMES.length - 1)]}`;
}

// Generate stats for a new player (freshman) based on a rating baseline (0-100 scale, where 50 is avg freshman)
function generatePlayerStats(position: Position, baseline: number, seed: number): Omit<Player, 'id' | 'name' | 'position' | 'year'> {
    const rng = makeRng(seed);
    const variance = randInt(rng, -10, 10);

    // Position modifiers
    const shootingMod = position === 'A' ? 10 : position === 'M' ? 5 : 0;
    const passingMod = position === 'M' ? 8 : position === 'A' ? 4 : position === 'FO' ? -5 : 0;
    const speedMod = position === 'LSM' ? 8 : position === 'M' ? 4 : position === 'G' ? -5 : 0;
    const defenseMod = position === 'D' ? 12 : position === 'LSM' ? 10 : position === 'G' ? 5 : -5;
    const iqMod = 0; // Baseline IQ
    const staminaMod = position === 'M' ? 5 : 0;
    const disciplineMod = 0;

    const shooting = clamp(Math.round(baseline + variance + shootingMod));
    const passing = clamp(Math.round(baseline + randInt(rng, -8, 8) + passingMod));
    const speed = clamp(Math.round(baseline + randInt(rng, -8, 8) + speedMod));
    const defense = clamp(Math.round(baseline + randInt(rng, -10, 10) + defenseMod));
    const IQ = clamp(Math.round(baseline + randInt(rng, -10, 10) + iqMod));
    const stamina = clamp(Math.round(baseline + randInt(rng, -10, 10) + staminaMod));
    const discipline = clamp(Math.round(baseline + randInt(rng, -10, 10) + disciplineMod));

    const overall = Math.round((shooting + passing + speed + defense + IQ + stamina + discipline) / 7);

    return { shooting, passing, speed, defense, IQ, stamina, discipline, overall };
}

// Convert a signed Recruit into a Freshman Player
export function recruitToPlayer(recruit: Recruit, teamId: string, seed: number): Player {
    // 1 star = ~50, 5 star = ~80
    // Linear scale: 42 + (stars * 8)
    const baseline = 42 + (recruit.stars * 8);
    const stats = generatePlayerStats(recruit.position, baseline, seed);

    return {
        id: `${teamId}-${recruit.id}`,
        name: recruit.name,
        position: recruit.position,
        year: 1,
        ...stats
    };
}

// Generate a random Walk-on / CPU Recruit
export function generateWalkOn(team: Team, position: Position, seed: number): Player {
    // Baseline based on team prestige (1-10)
    // Prestige 1 -> 45
    // Prestige 10 -> 55 (slightly better walk-ons for good schools)
    const baseline = 44 + team.prestige;
    const stats = generatePlayerStats(position, baseline, seed);

    return {
        id: `${team.id}-WO-${seed}`,
        name: generateName(seed),
        position,
        year: 1,
        ...stats
    };
}

// Process Offseason for a single team
export function processTeamOffseason(
    team: Team,
    currentRoster: Player[],
    recruits: Recruit[],
    seed: number
): Player[] {
    const nextRoster: Player[] = [];
    const rng = makeRng(seed);

    // 1. Process Returning Players (Graduation & Development)
    currentRoster.forEach(player => {
        if (player.year < 4) {
            // Develop
            // Apply to all stats equally for simplicity, plus some variance?
            // Let's just boost overall and recalculate? No, boost stats.

            const boost = (stat: number) => clamp(stat + randInt(rng, 0, 3));

            const nextPlayer: Player = {
                ...player,
                year: (player.year + 1) as 2 | 3 | 4,
                shooting: boost(player.shooting),
                passing: boost(player.passing),
                speed: boost(player.speed),
                defense: boost(player.defense),
                IQ: boost(player.IQ + 2), // IQ grows faster
                stamina: boost(player.stamina),
                discipline: boost(player.discipline + 1),
            };

            // Recalculate Overall
            nextPlayer.overall = Math.round((
                nextPlayer.shooting + nextPlayer.passing + nextPlayer.speed +
                nextPlayer.defense + nextPlayer.IQ + nextPlayer.stamina +
                nextPlayer.discipline
            ) / 7);

            nextRoster.push(nextPlayer);
        }
    });

    // 2. Add Signed Recruits
    recruits.forEach((recruit, i) => {
        nextRoster.push(recruitToPlayer(recruit, team.id, seed + i * 100));
    });

    // 3. Fill Roster Gaps (Walk-ons / CPU Recruits)
    // Target roster size ~26
    const targetSize = 26;
    let needs = targetSize - nextRoster.length;

    if (needs > 0) {
        // Simple distribution filler logic
        const currentPositions = nextRoster.reduce((acc, p) => {
            acc[p.position] = (acc[p.position] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Target dist: A:5, M:8, D:8, LSM:2, FO:2, G:2 (Total 27)
        // Adjust for 26.
        const targets: Record<string, number> = {
            'A': 5, 'M': 7, 'D': 7, 'LSM': 3, 'FO': 2, 'G': 2
        };

        // Prioritize filling specific needs
        const priorityList: Position[] = ['G', 'FO', 'A', 'D', 'M', 'LSM'];

        // First pass: fill critical shortages
        for (const pos of priorityList) {
             while ((currentPositions[pos] || 0) < targets[pos] && needs > 0) {
                 nextRoster.push(generateWalkOn(team, pos, seed + needs * 50));
                 currentPositions[pos] = (currentPositions[pos] || 0) + 1;
                 needs--;
             }
        }

        // Second pass: fill remaining slots randomly
        while (needs > 0) {
            const pos = priorityList[randInt(rng, 0, priorityList.length - 1)];
            nextRoster.push(generateWalkOn(team, pos, seed + needs * 75));
            needs--;
        }
    }

    return nextRoster;
}

export function generateCPURecruitingClass(team: Team, seed: number): Recruit[] {
    const rng = makeRng(seed);
    const count = randInt(rng, 6, 10); // 6-10 recruits
    const recruits: Recruit[] = [];

    for(let i=0; i<count; i++) {
        // Star rating based on prestige
        // Prestige 1 -> Avg 1.5 stars
        // Prestige 10 -> Avg 4.5 stars
        let stars = Math.round((team.prestige / 2.5) + randInt(rng, -1, 1));
        stars = Math.max(1, Math.min(5, stars));

        const positions: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
        const position = positions[randInt(rng, 0, positions.length - 1)];

        recruits.push({
            id: `cpu-${team.id}-${seed}-${i}`,
            name: generateName(seed + i * 50),
            position,
            stars,
            region: 'National',
            potential: 70 + (stars * 5), // approximate potential
            committedTeamId: team.id,
            motivations: [],
            dealbreaker: null
        });
    }
    return recruits;
}
