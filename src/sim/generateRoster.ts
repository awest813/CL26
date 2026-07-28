import { Player, Position, Team } from '../types/sim';
import { POSITIONS, ROSTER_POSITION_TARGETS } from './gameRules';
import { makeRng, pickOne, randInt, seedToNumber } from './rng';
import namesData from '../data/names.json' with { type: 'json' };

/**
 * Roster shape drawn straight from the target squad build, so the procedural draw,
 * recruiting position needs, and offseason turnover all agree on what a full team
 * looks like — including carrying real depth at goalie and the faceoff X.
 */
const POSITION_DISTRIBUTION: Position[] = POSITIONS.flatMap((position) =>
  Array.from({ length: ROSTER_POSITION_TARGETS[position] }, () => position),
);

const clamp = (value: number) => Math.max(40, Math.min(99, value));

export function generateRoster(team: Team, seed: string): Player[] {
  const rng = makeRng(seedToNumber(`${seed}:${team.id}`));
  const baseline = 45 + team.prestige * 0.4;

  return POSITION_DISTRIBUTION.map((position, index) => {
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

    return {
      id: `${team.id}-P${index + 1}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
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
    };
  });
}
