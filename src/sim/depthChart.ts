import type { Player, Position, Tactics } from '../types/sim.ts';
import { POSITION_ORDER } from '../types/sim.ts';
import { faceoffRating, savingRating } from './playerSpecialty.ts';
import { buildDefaultStarters } from './rosterManagement.ts';
import { activeRoster } from './redshirts.ts';

/**
 * The depth chart as the Roster page edits it: starting slots by position, swaps,
 * and how the lineup compares with the best one the roster can field.
 */

/** Starting spots by position: three attack, three midfield, three close defense, an LSM, a faceoff man, and a goalie. */
export const STARTER_SLOTS: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

export const POSITION_NAMES: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  LSM: 'Long-stick midfield',
  FO: 'Faceoff',
  G: 'Goalie',
};

/** The rating a player starts on: faceoffs for a faceoff man, saves for a goalie, overall for everyone else. */
export function startingRating(player: Player): number {
  if (player.position === 'FO') return faceoffRating(player);
  if (player.position === 'G') return savingRating(player);
  return player.overall;
}

export interface DepthSlot {
  position: Position;
  /** 1-based within the position, e.g. A2. */
  index: number;
  player: Player | null;
}

/** Each position's starting slots in depth-chart order, with empty slots where the chart is short. */
export function depthChartSlots(roster: Player[], starterIds: string[]): Record<Position, DepthSlot[]> {
  const byId = new Map(roster.map((player) => [player.id, player]));
  const slots = {} as Record<Position, DepthSlot[]>;
  for (const position of POSITION_ORDER) {
    const starters = starterIds
      .map((id) => byId.get(id))
      .filter((player): player is Player => Boolean(player && player.position === position && !player.redshirt))
      .slice(0, STARTER_SLOTS[position]);
    slots[position] = Array.from({ length: STARTER_SLOTS[position] }, (_, i) => ({
      position,
      index: i + 1,
      player: starters[i] ?? null,
    }));
  }
  return slots;
}

/**
 * Put `inId` in the lineup in place of `outId` (or into an empty slot when `outId` is null).
 * When `inId` already starts, the two trade slots, so a player is never listed twice.
 */
export function swapStarter(starterIds: string[], outId: string | null, inId: string): string[] {
  if (outId === inId) return starterIds;
  const inIndex = starterIds.indexOf(inId);
  const outIndex = outId ? starterIds.indexOf(outId) : -1;
  const next = [...starterIds];
  if (outIndex < 0) {
    if (inIndex < 0) next.push(inId);
    return next;
  }
  if (inIndex >= 0) {
    next[inIndex] = outId as string;
    next[outIndex] = inId;
    return next;
  }
  next[outIndex] = inId;
  return next;
}

/** The weakest current starter at a position, the one a new starter replaces by default. */
export function weakestStarter(roster: Player[], starterIds: string[], position: Position): Player | null {
  const slots = depthChartSlots(roster, starterIds)[position];
  if (slots.some((slot) => slot.player === null)) return null;
  return slots
    .map((slot) => slot.player as Player)
    .sort((a, b) => startingRating(a) - startingRating(b) || a.id.localeCompare(b.id))[0] ?? null;
}

/** The best lineup the roster can field: redshirts sit. */
export function bestLineup(roster: Player[]): string[] {
  return buildDefaultStarters(activeRoster(roster));
}

/** Starting-rating points each position leaves on the bench compared with the best lineup. */
export function lineupGap(roster: Player[], starterIds: string[]): { position: Position; points: number }[] {
  const current = depthChartSlots(roster, starterIds);
  const best = depthChartSlots(roster, bestLineup(roster));
  const total = (slots: DepthSlot[]) => slots.reduce((sum, slot) => sum + (slot.player ? startingRating(slot.player) : 0), 0);
  return POSITION_ORDER
    .map((position) => ({ position, points: total(best[position]) - total(current[position]) }))
    .filter((row) => row.points > 0);
}

export interface MidfieldLineReport {
  /** Average overall of the starting midfield line and of the next three middies. */
  firstLine: number;
  secondLine: number;
  /** First line minus second line. */
  gap: number;
  /** Average stamina of the starting field players. */
  stamina: number;
  /** The rotation that fits this roster and plan, and why. */
  suggestion: NonNullable<Tactics['midfieldRotation']>;
  reason: string;
}

/** Where riding the starters starts to pay: the second line this many points behind. */
const TIGHT_GAP = 5;
/** At or under this gap the lines are even enough to share the game. */
const EVEN_GAP = 0.5;
/** Starters this tired or worse want fresh legs late. */
const LOW_STAMINA = 67;

/**
 * How the midfield lines compare, and the rotation the match engine rewards for them:
 * a thin second line wants the starters ridden; even lines, low stamina, or a fast or
 * pressing plan (more wear) want a deep rotation. Thresholds come from engine sweeps.
 */
export function midfieldLineReport(roster: Player[], starterIds: string[], tactics: Tactics): MidfieldLineReport | null {
  const starters = new Set(starterIds);
  const middies = activeRoster(roster).filter((player) => player.position === 'M');
  const first = middies.filter((player) => starters.has(player.id));
  const second = middies.filter((player) => !starters.has(player.id)).sort((a, b) => b.overall - a.overall).slice(0, 3);
  if (first.length === 0 || second.length === 0) return null;
  const average = (players: Player[], value: (player: Player) => number) => players.reduce((sum, player) => sum + value(player), 0) / players.length;
  const firstLine = average(first, (player) => player.overall);
  const secondLine = average(second, (player) => player.overall);
  const gap = firstLine - secondLine;
  const fieldStarters = roster.filter((player) => starters.has(player.id) && player.position !== 'G');
  const stamina = fieldStarters.length > 0 ? average(fieldStarters, (player) => player.stamina) : 70;
  const wearHeavy = tactics.tempo === 'fast' || tactics.defensePackage === 'pressure';

  let suggestion: MidfieldLineReport['suggestion'] = 'balanced';
  let reason = 'The lines are close enough that a standard rotation is right.';
  if (gap >= TIGHT_GAP) {
    suggestion = 'tight';
    reason = `Your second line is ${Math.round(gap)} points behind the first, so ride the starters.`;
  } else if (gap <= EVEN_GAP) {
    suggestion = 'deep';
    reason = 'Your second line is as good as the first, so share the game and keep legs fresh.';
  } else if (stamina <= LOW_STAMINA) {
    suggestion = 'deep';
    reason = `Your starters' stamina is ${Math.round(stamina)}, so rotate deep to keep them fresh late.`;
  } else if (wearHeavy) {
    suggestion = 'deep';
    reason = 'A fast or pressing plan wears legs down, so rotate deep.';
  }
  return { firstLine, secondLine, gap, stamina, suggestion, reason };
}
