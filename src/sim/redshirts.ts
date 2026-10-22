import type { Player, Position } from '../types/sim';

/**
 * Redshirts: before the first game a coach can sit a player for the whole season. He
 * still practices and develops, keeps his class year at the offseason, and gains a year
 * of eligibility. Each player gets one, and a senior cannot take it.
 */

/** Players a position must keep in uniform: the starters plus one behind them. */
export const REDSHIRT_POSITION_FLOOR: Record<Position, number> = { A: 4, M: 4, D: 4, LSM: 2, FO: 2, G: 2 };

/** Who suits up this season. */
export function activeRoster(roster: Player[]): Player[] {
  return roster.some((player) => player.redshirt) ? roster.filter((player) => !player.redshirt) : roster;
}

/** Why a player cannot be redshirted, or null when he can. */
export function redshirtBlocker(player: Player, roster: Player[]): string | null {
  if (player.redshirt) return null;
  if (player.redshirtUsed) return 'He has already used his redshirt.';
  if (player.year >= 4) return 'Seniors cannot redshirt.';
  const left = activeRoster(roster).filter((other) => other.position === player.position && other.id !== player.id).length;
  if (left < REDSHIRT_POSITION_FLOOR[player.position]) return `The ${player.position} group would be too thin.`;
  return null;
}

/** The offseason step for one returning player: a year older, and a class year up unless he redshirted. */
export function advanceClassYear(player: Player): Player {
  if (player.redshirt) {
    return { ...player, age: player.age + 1, redshirt: false, redshirtUsed: true };
  }
  return { ...player, year: Math.min(4, player.year + 1) as Player['year'], age: player.age + 1 };
}

/** Redshirts can change only before the first game of the regular season. */
export function canChangeRedshirts(season: { phase: string; currentWeekIndex: number }): boolean {
  return season.phase === 'REGULAR' && season.currentWeekIndex === 0;
}
