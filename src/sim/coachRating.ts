/** The head coach's skill tree: levels bought in each branch. */
type SkillTreeLevels = { recruiting?: number; development?: number; operations?: number };

/**
 * Coaches on the same five-star scale as programs, in half steps. Ratings stay numbers
 * (head coach skill 40–99, assistants 40–95); stars are how the game names them. A 60 is a
 * league-average assistant at 2½ stars; the 76+ assistants programs hire away as head
 * coaches are four-star coaches.
 */

export interface CoachStarStep {
  stars: number;
  /** Lowest rating that earns this many stars. */
  min: number;
}

export const COACH_STAR_STEPS: CoachStarStep[] = [
  { stars: 5, min: 85 },
  { stars: 4.5, min: 80 },
  { stars: 4, min: 75 },
  { stars: 3.5, min: 70 },
  { stars: 3, min: 65 },
  { stars: 2.5, min: 60 },
  { stars: 2, min: 55 },
  { stars: 1.5, min: 50 },
  { stars: 1, min: -Infinity },
];

/** Stars for a coach rating, 1 to 5 in half steps. */
export function coachStars(rating: number): number {
  const value = Number.isFinite(rating) ? rating : 0;
  return COACH_STAR_STEPS.find((step) => value >= step.min)?.stars ?? 1;
}

/** What a coach of this many stars is called. */
export function coachTier(stars: number): string {
  if (stars >= 5) return 'Elite';
  if (stars >= 4) return 'Proven';
  if (stars >= 3) return 'Solid';
  if (stars >= 2) return 'Capable';
  return 'Green';
}

/** Skill-tree levels a head coach has bought, each worth a rating point. */
export function skillTreeLevels(tree: SkillTreeLevels | null | undefined): number {
  if (!tree) return 0;
  return [tree.recruiting, tree.development, tree.operations]
    .reduce<number>((sum, level) => sum + (typeof level === 'number' && Number.isFinite(level) ? level : 0), 0);
}

/** The head coach's rating: base skill plus a point per skill-tree level, so a career can earn stars. */
export function headCoachRating(skill: number, tree: SkillTreeLevels | null | undefined): number {
  return Math.min(99, Math.round(skill + skillTreeLevels(tree)));
}

/** Rating points to the next half star, or null at five stars. */
export function coachToNextStar(rating: number): { stars: number; points: number } | null {
  const current = coachStars(rating);
  const next = [...COACH_STAR_STEPS].reverse().find((step) => step.stars > current);
  if (!next) return null;
  return { stars: next.stars, points: Math.max(1, Math.ceil(next.min - rating)) };
}
