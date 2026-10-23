/**
 * Program prestige on a five-star scale. Prestige itself stays a 1–100 number (base
 * rating plus earned drift); stars are how the game names it, in half-star steps.
 * The cut lines split the base league into a pyramid: a handful of five-star
 * programs at the top, the same handful of one-stars at the bottom.
 */

export interface PrestigeStep {
  stars: number;
  /** Lowest prestige that earns this many stars. */
  min: number;
}

export const PRESTIGE_STAR_STEPS: PrestigeStep[] = [
  { stars: 5, min: 86 },
  { stars: 4.5, min: 81 },
  { stars: 4, min: 76 },
  { stars: 3.5, min: 71 },
  { stars: 3, min: 66 },
  { stars: 2.5, min: 61 },
  { stars: 2, min: 56 },
  { stars: 1.5, min: 51 },
  { stars: 1, min: -Infinity },
];

/** Stars for a prestige value, 1 to 5 in half steps. */
export function prestigeStars(prestige: number): number {
  const value = Number.isFinite(prestige) ? prestige : 0;
  return PRESTIGE_STAR_STEPS.find((step) => value >= step.min)?.stars ?? 1;
}

/**
 * What a program of this many stars is called. Kept apart from the situation names
 * (Rebuild, Stable, Win now), which say what the AD expects rather than how big the brand is.
 */
export function prestigeTier(stars: number): string {
  if (stars >= 5) return 'Blue blood';
  if (stars >= 4) return 'National power';
  if (stars >= 3) return 'Established';
  if (stars >= 2) return 'Mid-major';
  return 'Underdog';
}

/** "★★★½": filled stars with a half mark, for text-only places such as select options. */
export function prestigeStarText(stars: number): string {
  const whole = Math.floor(stars);
  return `${'★'.repeat(whole)}${stars - whole >= 0.5 ? '½' : ''}`;
}

/** Points of prestige to the next half star, or null at five stars. */
export function prestigeToNextStar(prestige: number): { stars: number; points: number } | null {
  const current = prestigeStars(prestige);
  const next = [...PRESTIGE_STAR_STEPS].reverse().find((step) => step.stars > current);
  if (!next) return null;
  return { stars: next.stars, points: Math.max(0.1, Math.round((next.min - prestige) * 10) / 10) };
}

/** Points of prestige above the line that would drop the program a half star, or null at one star. */
export function prestigeCushion(prestige: number): number | null {
  const current = PRESTIGE_STAR_STEPS.find((step) => prestige >= step.min);
  if (!current || !Number.isFinite(current.min)) return null;
  return Math.round((prestige - current.min) * 10) / 10;
}

/** Prestige as shown next to its stars: whole numbers stay whole, earned drift shows a tenth. */
export function formatPrestige(prestige: number): string {
  return Number.isInteger(prestige) ? String(prestige) : prestige.toFixed(1);
}

export type ProgramPullBand = 'strong' | 'even' | 'reach' | 'longShot';

/**
 * How a prospect sees the program, from `programPull`: a blue chip wants a program of
 * his own caliber, while a depth recruit is flattered when a bigger name calls.
 */
export function programPullBand(pull: number): ProgramPullBand {
  if (pull >= 1.05) return 'strong';
  if (pull >= 0.92) return 'even';
  if (pull >= 0.72) return 'reach';
  return 'longShot';
}

export const PROGRAM_PULL_LABELS: Record<ProgramPullBand, string> = {
  strong: 'Strong pull',
  even: 'Good fit',
  reach: 'Reach',
  longShot: 'Long shot',
};
