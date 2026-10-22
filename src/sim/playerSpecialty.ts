import type { Player, Position } from '../types/sim';
import { randInt } from './rng.ts';

const clamp = (value: number) => Math.max(40, Math.min(99, Math.round(value)));

/**
 * Faceoff rating, with a fallback for players saved before the rating existed:
 * the old engine's blend for a faceoff man, and a non-specialist's level for everyone else.
 */
export function faceoffRating(player: Player): number {
  if (player.faceoff != null) return player.faceoff;
  if (player.position === 'FO') {
    return clamp(player.passing * 0.15 + player.speed * 0.2 + player.discipline * 0.2 + player.overall * 0.45);
  }
  return clamp(player.overall - 18);
}

/** Goalkeeping rating, with the same kind of fallback as `faceoffRating`. */
export function savingRating(player: Player): number {
  if (player.saving != null) return player.saving;
  if (player.position === 'G') return clamp(player.defense * 0.7 + player.IQ * 0.3);
  return 40;
}

/** Specialist ratings for a new player around a talent baseline. Only the specialist is good at his own job. */
export function rollSpecialties(position: Position, baseline: number, rng: () => number): Pick<Player, 'faceoff' | 'saving'> {
  const faceoff = position === 'FO'
    ? clamp(baseline + 6 + randInt(rng, -8, 12))
    : clamp(baseline - 18 + randInt(rng, -6, 6));
  const saving = position === 'G'
    ? clamp(baseline + 6 + randInt(rng, -8, 10))
    : clamp(40 + randInt(rng, 0, 6));
  return { faceoff, saving };
}

/** One step of growth for a specialty, capped like the other traits. */
export function growSpecialty(value: number, growth: number, rng: () => number): number {
  if (value >= 92 || growth <= 0) return value;
  const room = value >= 86 ? 1 : 92 - value;
  return clamp(value + randInt(rng, 0, Math.min(growth, room)));
}

/**
 * The overall a player can grow to. Older saved players fall back to a ceiling that
 * leaves younger players more room: about three points per year of eligibility left.
 */
export function playerPotential(player: Player): number {
  if (player.potential != null) return player.potential;
  return clamp(player.overall + (5 - player.year) * 3);
}

/** A new player's ceiling: younger players have more room, and some outgrow their rating. */
export function rollPotential(overall: number, year: Player['year'], rng: () => number): number {
  return clamp(overall + (4 - year) * 3 + randInt(rng, -2, 10));
}
