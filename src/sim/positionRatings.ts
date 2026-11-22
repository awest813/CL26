import type { Player, Position } from '../types/sim';
import { faceoffRating, savingRating } from './playerSpecialty.ts';

type RatedTrait = 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline' | 'faceoff' | 'saving';

/**
 * How much each trait counts toward a player's overall at his position. The weights follow
 * what the match engine reads for that position, so the overall a coach sees, the starters a
 * staff picks, and what wins games agree: an attackman is his shooting and feeding, a
 * defenseman his defense and feet, a faceoff man his work at the dot, a goalie his saves.
 * Each row sums to 1.
 */
export const POSITION_TRAIT_WEIGHTS: Record<Position, Partial<Record<RatedTrait, number>>> = {
  A: { shooting: 0.4, passing: 0.2, IQ: 0.15, speed: 0.1, stamina: 0.05, discipline: 0.05, defense: 0.05 },
  M: { shooting: 0.22, passing: 0.13, defense: 0.2, speed: 0.15, IQ: 0.12, stamina: 0.12, discipline: 0.06 },
  D: { defense: 0.45, speed: 0.15, IQ: 0.15, discipline: 0.1, stamina: 0.08, passing: 0.05, shooting: 0.02 },
  LSM: { defense: 0.35, speed: 0.22, IQ: 0.12, stamina: 0.1, discipline: 0.08, passing: 0.08, shooting: 0.05 },
  FO: { faceoff: 0.55, speed: 0.12, IQ: 0.08, stamina: 0.08, discipline: 0.07, passing: 0.05, shooting: 0.05 },
  G: { saving: 0.6, IQ: 0.15, passing: 0.1, discipline: 0.05, defense: 0.05, speed: 0.05 },
};

/**
 * Points taken off each position's weighted total so a given overall means the same standing at
 * every position. Recruits and rosters are generated with position bonuses (a defenseman's
 * defense, an attackman's shooting), which the weights above count more heavily than a flat
 * average did. Without this, defensemen and specialists would read three to five points higher
 * than middies of the same talent. Fit on generated league rosters; a test holds the spread.
 */
const POSITION_CALIBRATION: Record<Position, number> = { A: 1.8, M: 0, D: 2.8, LSM: 2.5, FO: 3, G: 2.8 };

export type OverallInputs = Pick<Player, 'position' | 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline'>
  & Partial<Pick<Player, 'faceoff' | 'saving' | 'overall'>>;

/** A player's overall at his position: his traits weighted by what the position asks of them. */
export function positionOverall(player: OverallInputs): number {
  const weights = POSITION_TRAIT_WEIGHTS[player.position];
  let total = 0;
  for (const [trait, weight] of Object.entries(weights) as Array<[RatedTrait, number]>) {
    const value = trait === 'faceoff'
      ? faceoffRating(player as Player)
      : trait === 'saving'
        ? savingRating(player as Player)
        : player[trait];
    total += value * weight;
  }
  return Math.max(40, Math.min(99, Math.round(total - POSITION_CALIBRATION[player.position])));
}

/**
 * A saved player re-rated at his position, for saves from before overall was position-weighted.
 * His potential moves by the same amount, so his room to grow is unchanged.
 */
export function rerateAtPosition(player: Player): Player {
  const overall = positionOverall(player);
  if (overall === player.overall) return player;
  const potential = player.potential != null
    ? Math.max(40, Math.min(99, player.potential + overall - player.overall))
    : undefined;
  return { ...player, overall, ...(potential != null ? { potential } : {}) };
}
