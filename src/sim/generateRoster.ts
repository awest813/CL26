import { Player, Position, Team } from '../types/sim';
import { makeRng, randInt, seedToNumber } from './rng';
import { drawName } from './names';
import { rollPotential, rollSpecialties } from './playerSpecialty';

/** Positions in the order a generated roster fills them. */
export const ROSTER_POSITION_ORDER: Position[] = [
  'A', 'A', 'A',
  'M', 'M', 'M', 'M',
  'D', 'D', 'D',
  'LSM',
  'FO',
  'G',
  'A', 'M', 'D', 'M', 'D', 'A', 'M', 'D',
  'LSM', 'M', 'D', 'A',
  // Second string: two deep at every position, about 32 players. Appended so the first 25 keep their ratings.
  'A', 'M', 'M', 'LSM', 'FO', 'G', 'G',
];

/** Players a full roster carries. */
export const ROSTER_SIZE = ROSTER_POSITION_ORDER.length;

/** How many of each position a full roster carries. */
export const ROSTER_POSITION_TARGETS: Record<Position, number> = ROSTER_POSITION_ORDER.reduce(
  (counts, position) => ({ ...counts, [position]: counts[position] + 1 }),
  { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 } as Record<Position, number>,
);

const clamp = (value: number) => Math.max(40, Math.min(99, value));

/**
 * A program's roster for one season. `talentOffset` (rating points) moves the whole
 * roster up or down from what the program's prestige alone would give.
 */
export function generateRoster(team: Team, seed: string, talentOffset = 0): Player[] {
  const rng = makeRng(seedToNumber(`${seed}:${team.id}`));
  const baseline = 45 + team.prestige * 0.4 + talentOffset;
  // No two players on a roster share a name.
  const names = new Set<string>();

  return ROSTER_POSITION_ORDER.map((position, index) => {
    const year = randInt(rng, 1, 4) as 1 | 2 | 3 | 4;
    const age = 17 + year + randInt(rng, 0, 1);
    const variance = randInt(rng, -12, 12);

    const shooting = clamp(Math.round(baseline + variance + (position === 'A' ? 8 : 0) + (position === 'M' ? 4 : 0)));
    const passing = clamp(Math.round(baseline + randInt(rng, -10, 10) + (position === 'M' ? 6 : 0) + (position === 'FO' ? -4 : 0)));
    const speed = clamp(Math.round(baseline + randInt(rng, -9, 11) + (position === 'LSM' ? 5 : 0) + (position === 'G' ? -3 : 0)));
    const defense = clamp(Math.round(baseline + randInt(rng, -11, 10) + (position === 'D' ? 10 : 0) + (position === 'LSM' ? 8 : 0) + (position === 'G' ? 6 : 0)));
    const IQ = clamp(Math.round(baseline + randInt(rng, -8, 12) + (year - 2)));
    const stamina = clamp(Math.round(baseline + randInt(rng, -8, 9)));
    const discipline = clamp(Math.round(baseline + randInt(rng, -7, 10) + (year - 2)));

    const overall = Math.round((shooting + passing + speed + defense + IQ + stamina + discipline) / 7);
    const skill = clamp(Math.round(overall + (year - 2) + randInt(rng, -3, 3)));
    const specialtyRng = makeRng(seedToNumber(`${seed}:${team.id}:${index}:specialty`));

    return {
      id: `${team.id}-P${index + 1}`,
      name: drawName(rng, names),
      position,
      year,
      age,
      skill,
      shooting,
      passing,
      speed,
      defense,
      IQ,
      stamina,
      discipline,
      overall,
      // Own stream, so adding the specialties and potential left every existing rating where it was.
      ...rollSpecialties(position, baseline, specialtyRng),
      potential: rollPotential(overall, year, specialtyRng),
    };
  });
}
