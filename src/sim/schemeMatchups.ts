import type { Tactics, Team } from '../types/sim';
import { makeRng, seedToNumber } from './rng.ts';

/**
 * How one side's scheme plays against the other's. Every call has a matchup it
 * wins and one it loses, so the best scheme depends on the opponent.
 *
 * Shot-quality edges are on the match engine's quality scale (0.01 is about one
 * point of shooting percentage on a shot on goal).
 */

type OffenseSet = NonNullable<Tactics['offenseSet']>;
type DefensePackage = NonNullable<Tactics['defensePackage']>;
type SlideTiming = Tactics['slideAggression'];

export const OFFENSE_SETS: OffenseSet[] = ['balanced', 'motion', 'invert', 'crease'];
export const DEFENSE_PACKAGES: DefensePackage[] = ['man', 'zone', 'pressure'];

/** Offense set (rows) against defense package (columns). */
const SET_VS_PACKAGE: Record<OffenseSet, Record<DefensePackage, number>> = {
  // No read to exploit, nothing to punish.
  balanced: { man: 0, zone: 0, pressure: 0 },
  // Ball movement pulls a zone apart and beats the pressure, but stalls against a set man look.
  motion: { man: -0.02, zone: 0.03, pressure: 0.015 },
  // Top-side dodges hunt man matchups; a zone walls them off.
  invert: { man: 0.03, zone: -0.025, pressure: -0.005 },
  // Inside cuts beat a jumping pressure and soft man coverage; a packed zone smothers the crease.
  crease: { man: 0.015, zone: -0.03, pressure: 0.025 },
};

/** Slide timing (rows) against offense set (columns), as a shot-quality edge for the offense. */
const SLIDE_VS_SET: Record<SlideTiming, Record<OffenseSet, number>> = {
  // Early slides meet dodgers and cutters, then get skipped around by ball movement.
  early: { balanced: -0.005, motion: 0.025, invert: -0.02, crease: -0.015 },
  normal: { balanced: 0, motion: 0, invert: 0, crease: 0 },
  // Late slides stay home against ball movement and give dodgers a clean step.
  late: { balanced: 0.005, motion: -0.02, invert: 0.02, crease: 0.015 },
};

/** Shot-quality edge for an offense running `offense` against a defense running `defense`. */
export function schemeShotQualityEdge(offense: Tactics, defense: Tactics): number {
  // Unknown values (an old or hand-edited save) read as the neutral call.
  const set: OffenseSet = offense.offenseSet && offense.offenseSet in SET_VS_PACKAGE ? offense.offenseSet : 'balanced';
  const pkg: DefensePackage = defense.defensePackage && defense.defensePackage in SET_VS_PACKAGE.balanced ? defense.defensePackage : 'man';
  const slides = SLIDE_VS_SET[defense.slideAggression] ?? SLIDE_VS_SET.normal;
  let edge = SET_VS_PACKAGE[set][pkg] + slides[set];
  // Patience buys better looks; pace trades them for volume.
  if (offense.tempo === 'slow') edge += 0.01;
  if (offense.tempo === 'fast') edge -= 0.01;
  return edge;
}

/** Change to the offense's forced-turnover chance from both schemes. */
export function schemeTurnoverEdge(offense: Tactics, defense: Tactics): number {
  let edge = 0;
  if (offense.offenseSet === 'invert') edge += 0.012;
  if (offense.offenseSet === 'motion') edge += 0.006;
  if (offense.tempo === 'fast') edge += 0.012;
  if (offense.tempo === 'slow') edge -= 0.008;
  if (defense.defensePackage === 'pressure') edge += defense.slideAggression === 'early' ? 0.03 : 0.022;
  if (defense.defensePackage === 'zone') edge -= 0.01;
  return edge;
}

/** Defensive fouls per possession added by a defense's scheme. */
export function schemeDefensiveFoulEdge(defense: Tactics): number {
  let edge = 0;
  if (defense.slideAggression === 'early') edge += 0.015;
  if (defense.slideAggression === 'late') edge -= 0.008;
  if (defense.defensePackage === 'pressure') edge += 0.014;
  if (defense.defensePackage === 'zone') edge -= 0.006;
  return edge;
}

/** Offensive fouls per possession added by an offense's scheme. */
export function schemeOffensiveFoulEdge(offense: Tactics): number {
  if (offense.offenseSet === 'crease') return 0.008;
  if (offense.offenseSet === 'invert') return 0.004;
  return 0;
}

/** Clear success adjustment for the clearing team, against the other side's ride. */
export function schemeClearEdge(clearing: Tactics, riding: Tactics): number {
  let edge = 0;
  if (clearing.rideClear === 'conservative') edge += 0.03;
  if (clearing.rideClear === 'aggressive') edge -= 0.01;
  if (riding.rideClear === 'aggressive') edge -= 0.06;
  if (riding.rideClear === 'conservative') edge += 0.03;
  return edge;
}

/** Extra ground balls a defense package creates before modeled events. */
export function schemeGroundBallEdge(tactics: Tactics): number {
  if (tactics.defensePackage === 'pressure') return 2;
  if (tactics.defensePackage === 'zone') return -1;
  return 0;
}

const SCOUTING_SCALE = 150;

/** Shot-quality edge on the team-rating scale the Weekly Hub shows (about 1.5 points per 0.01). */
export function edgeToRatingPoints(edge: number): number {
  return Math.round(edge * SCOUTING_SCALE * 10) / 10;
}

function pickWeighted<T>(rng: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

/**
 * A CPU program's identity: the scheme its staff runs every week. Seeded by the
 * program id alone, so a school keeps its style from season to season.
 */
export function programTactics(team: Pick<Team, 'id'>): Tactics {
  const rng = makeRng(seedToNumber(`${team.id}:scheme-identity`));
  return {
    tempo: pickWeighted(rng, [['slow', 0.25], ['normal', 0.5], ['fast', 0.25]]),
    rideClear: pickWeighted(rng, [['conservative', 0.25], ['balanced', 0.5], ['aggressive', 0.25]]),
    slideAggression: pickWeighted(rng, [['early', 0.3], ['normal', 0.4], ['late', 0.3]]),
    offenseSet: pickWeighted(rng, [['balanced', 0.25], ['motion', 0.25], ['invert', 0.25], ['crease', 0.25]]),
    defensePackage: pickWeighted(rng, [['man', 0.45], ['zone', 0.3], ['pressure', 0.25]]),
  };
}

export interface ScoutingReport {
  /** Your offense against their defense, in rating points (positive favors you). */
  offenseEdge: number;
  /** Their offense against your defense, in rating points (positive favors you). */
  defenseEdge: number;
  /** The offense set with the best look at their defense, and its edge. */
  bestOffenseSet: OffenseSet;
  bestOffenseEdge: number;
  /** The defense package that best handles their offense, and its edge for you. */
  bestDefensePackage: DefensePackage;
  bestDefenseEdge: number;
}

/** How your game-day scheme lines up with an opponent's, and what would line up better. */
export function scoutOpponent(user: Tactics, opponent: Tactics): ScoutingReport {
  const offenseEdge = edgeToRatingPoints(schemeShotQualityEdge(user, opponent));
  const defenseEdge = edgeToRatingPoints(-schemeShotQualityEdge(opponent, user));

  let bestOffenseSet: OffenseSet = user.offenseSet ?? 'balanced';
  let bestOffenseEdge = offenseEdge;
  for (const set of OFFENSE_SETS) {
    const edge = edgeToRatingPoints(schemeShotQualityEdge({ ...user, offenseSet: set }, opponent));
    if (edge > bestOffenseEdge) {
      bestOffenseSet = set;
      bestOffenseEdge = edge;
    }
  }

  let bestDefensePackage: DefensePackage = user.defensePackage ?? 'man';
  let bestDefenseEdge = defenseEdge;
  for (const pkg of DEFENSE_PACKAGES) {
    const edge = edgeToRatingPoints(-schemeShotQualityEdge(opponent, { ...user, defensePackage: pkg }));
    if (edge > bestDefenseEdge) {
      bestDefensePackage = pkg;
      bestDefenseEdge = edge;
    }
  }

  return { offenseEdge, defenseEdge, bestOffenseSet, bestOffenseEdge, bestDefensePackage, bestDefenseEdge };
}
