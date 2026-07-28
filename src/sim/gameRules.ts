/**
 * NCAA lacrosse game-rules constants.
 *
 * Men's and women's college lacrosse share the same period structure but differ
 * in on-field count, possession clock, and default lineup shape.  Keep these
 * values as the single source of truth so the match engine, UI, and any future
 * clock simulation all stay consistent.
 */
import type { Position } from '../types/sim';

// ---------------------------------------------------------------------------
// Period / clock
// ---------------------------------------------------------------------------

/** Number of quarters in a regulation game (both men's and women's). */
export const PERIODS = 4;

/** Duration of each quarter in seconds (15 minutes). */
export const PERIOD_LENGTH_SECONDS = 900;

/** Total regulation game time in seconds. */
export const REGULATION_SECONDS = PERIODS * PERIOD_LENGTH_SECONDS; // 3 600

/** Quarter number after which halftime occurs. */
export const HALFTIME_AFTER_PERIOD = 2;

// ---------------------------------------------------------------------------
// Possession / shot clock
// ---------------------------------------------------------------------------

/** Men's shot clock in seconds (80 s). */
export const MEN_SHOT_CLOCK_SECONDS = 80;

/**
 * Seconds remaining on the men's shot clock by which the ball must have
 * advanced past midfield (i.e., the team has 20 s to clear). */
export const MEN_CLEAR_DEADLINE_SECONDS = 60;

/** Women's possession clock in seconds (90 s). */
export const WOMEN_POSSESSION_CLOCK_SECONDS = 90;

/** Possession changes to the opponent when the clock expires. */
export const TURNOVER_ON_CLOCK_VIOLATION = true;

// ---------------------------------------------------------------------------
// On-field counts
// ---------------------------------------------------------------------------

/** Men's on-field players per team. */
export const MEN_ON_FIELD = 10;

/** Women's on-field players per team. */
export const WOMEN_ON_FIELD = 12;

// ---------------------------------------------------------------------------
// Default lineup shapes
// ---------------------------------------------------------------------------

/**
 * Men's default starting lineup (10 players).
 * GK 1 · DEF 3 · MID 3 · ATK 3
 */
export const MEN_DEFAULT_LINEUP = {
  goalkeeper: 1,
  defenders: 3,
  midfielders: 3,
  attackers: 3,
  total: 10,
} as const;

/**
 * Women's default starting lineup (12 players).
 * GK 1 · DEF 4 · MID 3 · ATK 4
 */
export const WOMEN_DEFAULT_LINEUP = {
  goalkeeper: 1,
  defenders: 4,
  midfielders: 3,
  attackers: 4,
  total: 12,
} as const;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** Field positions in depth-chart order. */
export const POSITIONS: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];

/** Full position names as a broadcast or box score would list them. */
export const POSITION_LABELS: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Close Defense',
  LSM: 'Long-Stick Midfield',
  FO: 'Faceoff Specialist',
  G: 'Goalie',
};

/** Compact labels for tables and chips. */
export const POSITION_SHORT_LABELS: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  LSM: 'LSM',
  FO: 'FOGO',
  G: 'Goalie',
};

/**
 * Starting slots at each position.
 *
 * Ten men are on the field at once (see `MEN_ON_FIELD`): 3 attack, 3 midfield,
 * 3 close defense, 1 goalie. The long-stick midfielder and the faceoff
 * specialist are first-choice specialists who rotate into a midfield slot for
 * defensive sets and the draw, which is why the depth chart names twelve roles.
 */
export const STARTER_SLOTS_BY_POSITION: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

/**
 * Target roster shape for a program. Drives recruiting position needs, signing-day
 * fit, and the procedural roster draw so all three agree on what a full team is.
 */
export const ROSTER_POSITION_TARGETS: Record<Position, number> = {
  A: 5,
  M: 8,
  D: 6,
  LSM: 2,
  FO: 2,
  G: 2,
};

/** Bodies a roster must keep at each position to field a legal lineup. */
export const POSITION_MINIMUMS: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

/** Full roster size implied by the position targets. */
export const ROSTER_TARGET_SIZE = POSITIONS.reduce(
  (total, position) => total + ROSTER_POSITION_TARGETS[position],
  0,
);

// ---------------------------------------------------------------------------
// Roster limits (NCAA Division I opt-in House settlement model)
// ---------------------------------------------------------------------------

/** Maximum roster size for men's D-I lacrosse. */
export const MEN_ROSTER_MAX = 48;

/** Maximum roster size for women's D-I lacrosse. */
export const WOMEN_ROSTER_MAX = 38;

/** Redshirt eligibility is permitted. */
export const ALLOW_REDSHIRTS = true;

/** Injured-reserve designation is permitted. */
export const ALLOW_INJURED_RESERVE = true;

// ---------------------------------------------------------------------------
// Field dimensions
// ---------------------------------------------------------------------------

/** Men's field length in yards. */
export const MEN_FIELD_LENGTH_YARDS = 110;

/** Men's field width in yards. */
export const MEN_FIELD_WIDTH_YARDS = 60;

/** Women's optimal field length in yards (~120 yd / 110 m). */
export const WOMEN_FIELD_LENGTH_YARDS = 120;

/** Women's optimal field width in yards (~65 yd / 60 m). */
export const WOMEN_FIELD_WIDTH_YARDS = 65;

/** Women's distance between goal lines in yards (~100 yd / 92 m). */
export const WOMEN_GOAL_LINE_DISTANCE_YARDS = 100;
