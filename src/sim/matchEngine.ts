import { GameResult, Player, PlayerGameStats, Position, TeamGameplayModifiers, Tactics, TeamGameStats, TeamSimInput } from '../types/sim';
import { makeRng, normalish, pickOne, randInt } from './rng.ts';
import { MEN_SHOT_CLOCK_SECONDS, PERIOD_LENGTH_SECONDS, PERIODS, REGULATION_SECONDS } from './gameRules.ts';
import { clockAtElapsed, OVERTIME_PERIOD_SECONDS } from './timeUtils.ts';
import { faceoffRating, savingRating } from './playerSpecialty.ts';
import {
  edgeToRatingPoints,
  schemeClearEdge,
  schemeDefensiveFoulEdge,
  schemeGroundBallEdge,
  schemeOffensiveFoulEdge,
  schemeShotQualityEdge,
  schemeTurnoverEdge,
} from './schemeMatchups.ts';
import { DEFAULT_TACTICS } from './tactics.ts';

export type { Tactics, TeamSimInput, TeamGameStats, PlayerGameStats, GameResult };

/** A weighted draw table built once per team per game. */
interface WeightedPool {
  players: Player[];
  cumulative: number[];
  total: number;
}

interface TeamRatings {
  offense: number;
  defense: number;
  goalie: number;
  faceoff: number;
  discipline: number;
  goaliePlayer: Player;
  faceoffPlayer: Player | null;
  shooters: WeightedPool;
  feeders: WeightedPool;
  scrappers: WeightedPool;
  defenders: WeightedPool;
}

interface EffectiveGameplayModifiers extends TeamGameplayModifiers {
  shotQuality: number;
  turnoverAvoidance: number;
  penaltyAvoidance: number;
  groundBallBonus: number;
}

const ZERO_GAMEPLAN: EffectiveGameplayModifiers = {
  offense: 0,
  defense: 0,
  goalie: 0,
  faceoff: 0,
  discipline: 0,
  shotQuality: 0,
  turnoverAvoidance: 0,
  penaltyAvoidance: 0,
  groundBallBonus: 0,
};

// Settled-offense mistakes: a forced turnover the defense earns, plus an unforced one when the offense cannot get a shot off.
const TURNOVER_BASE_CHANCE = 0.13;
const TURNOVER_MIN_CHANCE = 0.05;
const TURNOVER_MAX_CHANCE = 0.3;
const RETAINED_POSSESSION_TURNOVER_SCALE = 0.45;
const DEFENSIVE_DISCIPLINE_TURNOVER_DIVISOR = 900;
const SHOT_ATTEMPT_BASE_CHANCE = 0.9;
const SHOT_ATTEMPT_MIN_CHANCE = 0.72;
const SHOT_ATTEMPT_MAX_CHANCE = 0.97;
const CAUSED_TURNOVER_GROUND_BALL_CHANCE = 0.55;

const DISCIPLINE_PIVOT = 72;
const PENALTY_BASE_CHANCE = 0.03;
const DEFENSIVE_FOUL_BASE_CHANCE = 0.062;
const PENALTY_MIN_CHANCE = 0.012;
const PENALTY_MAX_CHANCE = 0.15;
const DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR = 400;
// Penalty time: the fouling team plays a man down until it is served (or, for a releasable foul, until the other side scores).
const MAN_UP_GOAL_BOOST = 0.01;
/** With the extra man, the offense wins more of the chases after a missed shot. */
const MAN_UP_BACKUP_BONUS = 0.05;
const MAN_UP_SETUP_SECONDS_MIN = 8;
const MAN_UP_SETUP_SECONDS_MAX = 24;
const MAN_UP_SHOT_BOOST = 0.03;
const MAN_UP_TURNOVER_SCALE = 0.6;
const MAN_DOWN_CLEAR_COST = 0.08;
const MAN_DOWN_QUALITY_COST = 0.03;
const OFFENSIVE_PERSONAL_FOUL_SHARE = 0.4;

// Clears: the team that gains the ball in its own end has to carry it over midfield.
const CLEAR_BASE_CHANCE = 0.87;
const CLEAR_MIN_CHANCE = 0.7;
const CLEAR_MAX_CHANCE = 0.97;
const BEATEN_RIDE_TRANSITION_CHANCE = 0.35;
const TRANSITION_QUALITY_BOOST = 0.07;

// Faceoffs: one draw per goal and per period start.
const FACEOFF_EDGE_DIVISOR = 40;
const FACEOFF_WING_WEIGHT = 0.2;
const NO_SPECIALIST_FACEOFF = 55;
const FACEOFF_EDGE_WEIGHT = 0.12;
const FACEOFF_FORM_VARIANCE = 0.04;
const FACEOFF_MIN_CHANCE = 0.3;
const FACEOFF_MAX_CHANCE = 0.7;
const FACEOFF_WINNER_GROUND_BALL_CHANCE = 0.6;
const FACEOFF_FAST_BREAK_CHANCE = 0.12;

// Shots: on-cage rate is driven by the shooter, goal rate by the shooter against the goalie.
const SHOT_QUALITY_POWER_DIVISOR = 150;
const SHOT_QUALITY_VARIANCE = 0.06;
const ON_GOAL_BASE_CHANCE = 0.6;
const ON_GOAL_MIN_CHANCE = 0.42;
const ON_GOAL_MAX_CHANCE = 0.8;
const GOAL_BASE_CHANCE = 0.45;
const GOAL_MIN_CHANCE = 0.26;
const GOAL_MAX_CHANCE = 0.74;
const SHOOTER_SKILL_PIVOT = 70;
const MISS_BACKUP_CHANCE = 0.42;
const SAVE_REBOUND_CHANCE = 0.14;
const LOOSE_BALL_GROUND_BALL_CHANCE = 0.5;
const MAX_SHOTS_PER_POSSESSION = 5;
const ASSIST_CHANCE = 0.56;

// Clock: the offense's tempo sets how long it holds the ball before the first look.
const SETUP_SECONDS: Record<Tactics['tempo'], number> = { slow: 47, normal: 38, fast: 30 };
const RESET_SECONDS_MIN = 8;
const RESET_SECONDS_MAX = 20;
const CLEAR_SECONDS = 9;
const FACEOFF_SECONDS = 4;
const TRANSITION_SECONDS = 7;

const MAX_OVERTIME_PERIODS = 30;
const OVERTIME_BASE_WIN_CHANCE = 0.5;
const OVERTIME_EDGE_DIVISOR = 260;
const OVERTIME_MIN_WIN_CHANCE = 0.35;
const OVERTIME_MAX_WIN_CHANCE = 0.65;
const OVERTIME_FACEOFF_WEIGHT = 0.12;

const MIN_SCORING_RUN_FOR_HIGHLIGHT = 3;
const MAX_PLAY_HIGHLIGHTS = 20;

const SHOOTER_ROLE: Record<Position, number> = { A: 1.35, M: 1, LSM: 0.1, D: 0.03, FO: 0.06, G: 0 };
const FEEDER_ROLE: Record<Position, number> = { A: 1.4, M: 1, LSM: 0.15, D: 0.1, FO: 0.05, G: 0.02 };
const SCRAPPER_ROLE: Record<Position, number> = { A: 0.6, M: 1, LSM: 1.4, D: 0.9, FO: 0.3, G: 0.15 };
const DEFENDER_ROLE: Record<Position, number> = { A: 0.1, M: 0.6, LSM: 1.3, D: 1.4, FO: 0.2, G: 0.1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveStarterSet(roster: Player[], starterIds?: string[]): Set<string> | null {
  if (!starterIds || starterIds.length === 0) return null;
  const rosterIds = new Set(roster.map((p) => p.id));
  const resolved = starterIds.filter((id) => rosterIds.has(id));
  if (resolved.length === 0) return null;
  return new Set(resolved);
}

function playerDepthWeight(playerId: string, starterSet: Set<string> | null): number {
  if (!starterSet) return 1;
  return starterSet.has(playerId) ? 1.78 : 0.38;
}

function shooterSkill(p: Player): number {
  return p.shooting * 0.75 + p.IQ * 0.25;
}

function buildPool(roster: Player[], weightOf: (p: Player) => number): WeightedPool {
  const players: Player[] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (const p of roster) {
    const w = weightOf(p);
    if (w <= 0) continue;
    total += w;
    players.push(p);
    cumulative.push(total);
  }
  return { players, cumulative, total };
}

function drawFromPool(rng: () => number, pool: WeightedPool, fallback: Player, exclude?: Player): Player {
  if (pool.players.length === 0) return fallback;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = rng() * pool.total;
    let picked = pool.players[pool.players.length - 1];
    for (let i = 0; i < pool.cumulative.length; i += 1) {
      if (r <= pool.cumulative[i]) {
        picked = pool.players[i];
        break;
      }
    }
    if (!exclude || picked.id !== exclude.id || pool.players.length === 1) return picked;
  }
  return pool.players.find((p) => p.id !== exclude?.id) ?? fallback;
}

function calcRatings(roster: Player[], starterIds?: string[]): TeamRatings {
  const starterSet = resolveStarterSet(roster, starterIds);

  let offWeighted = 0;
  let offDenom = 0;
  let defWeighted = 0;
  let defDenom = 0;
  let foWeighted = 0;
  let foDenom = 0;
  let disWeighted = 0;
  let disDenom = 0;
  let wingWeighted = 0;
  let wingDenom = 0;
  let faceoffPlayer: Player | null = null;
  let faceoffPlayerWeight = 0;

  for (const p of roster) {
    const w = playerDepthWeight(p.id, starterSet);
    disWeighted += p.discipline * w;
    disDenom += w;
    // Wings on the draw: long poles first, short-stick middies behind them.
    if (p.position === 'LSM' || p.position === 'M') {
      const wingWeight = p.position === 'LSM' ? w : w * 0.4;
      wingWeighted += (p.speed * 0.6 + p.defense * 0.2 + p.IQ * 0.2) * wingWeight;
      wingDenom += wingWeight;
    }

    const pos = p.position;
    if (pos === 'A') {
      offWeighted += (p.shooting * 0.55 + p.passing * 0.25 + p.IQ * 0.2) * w;
      offDenom += w;
    } else if (pos === 'M') {
      offWeighted += (p.shooting * 0.55 + p.passing * 0.25 + p.IQ * 0.2) * w;
      offDenom += w;
      defWeighted += (p.defense * 0.6 + p.speed * 0.2 + p.IQ * 0.2) * w;
      defDenom += w;
    } else if (pos === 'D' || pos === 'LSM') {
      defWeighted += (p.defense * 0.6 + p.speed * 0.2 + p.IQ * 0.2) * w;
      defDenom += w;
    } else if (pos === 'FO') {
      foWeighted += faceoffRating(p) * w;
      foDenom += w;
      if (w > faceoffPlayerWeight) {
        faceoffPlayer = p;
        faceoffPlayerWeight = w;
      }
    }
  }

  const goalies = roster.filter((p) => p.position === 'G');
  const starterGoalie = starterSet ? goalies.find((g) => starterSet.has(g.id)) : undefined;
  const goaliePlayer = starterGoalie ?? goalies[0] ?? roster[0];
  const depth = (p: Player) => playerDepthWeight(p.id, starterSet);

  return {
    offense: offWeighted / Math.max(offDenom, 1e-6),
    defense: defWeighted / Math.max(defDenom, 1e-6),
    goalie: savingRating(goaliePlayer) * 0.75 + goaliePlayer.IQ * 0.25,
    faceoff: (foDenom > 0 ? foWeighted / foDenom : NO_SPECIALIST_FACEOFF) * (1 - FACEOFF_WING_WEIGHT)
      + (wingDenom > 0 ? wingWeighted / wingDenom : NO_SPECIALIST_FACEOFF) * FACEOFF_WING_WEIGHT,
    discipline: disWeighted / Math.max(disDenom, 1e-6),
    goaliePlayer,
    faceoffPlayer,
    shooters: buildPool(roster, (p) => depth(p) * SHOOTER_ROLE[p.position] * (shooterSkill(p) / SHOOTER_SKILL_PIVOT) ** 3),
    feeders: buildPool(roster, (p) => depth(p) * FEEDER_ROLE[p.position] * ((p.passing * 0.7 + p.IQ * 0.3) / SHOOTER_SKILL_PIVOT) ** 3),
    scrappers: buildPool(roster, (p) => depth(p) * SCRAPPER_ROLE[p.position] * ((p.speed * 0.5 + p.defense * 0.3 + p.IQ * 0.2) / SHOOTER_SKILL_PIVOT) ** 2),
    defenders: buildPool(roster, (p) => depth(p) * DEFENDER_ROLE[p.position] * ((p.defense * 0.7 + p.IQ * 0.3) / SHOOTER_SKILL_PIVOT) ** 2),
  };
}

/**
 * How far a scheme moves offense, defense, and ground balls against an opponent's scheme
 * (a standard man look by default), on the same scale as the gameplan modifiers.
 */
export function tacticRatingShift(
  tactics: Tactics,
  opponent: Tactics = DEFAULT_TACTICS,
): { offense: number; defense: number; groundBalls: number } {
  return {
    offense: edgeToRatingPoints(schemeShotQualityEdge(tactics, opponent)),
    defense: edgeToRatingPoints(-schemeShotQualityEdge(opponent, tactics)),
    groundBalls: schemeGroundBallEdge(tactics),
  };
}

/** Clear success for the team carrying the ball out, against the other side's ride. */
function clearChance(clearing: Tactics, riding: Tactics, clearingDiscipline: number, manDown: boolean): number {
  const chance = CLEAR_BASE_CHANCE + (clearingDiscipline - DISCIPLINE_PIVOT) / 600 + schemeClearEdge(clearing, riding)
    - (manDown ? MAN_DOWN_CLEAR_COST : 0);
  return clamp(chance, CLEAR_MIN_CHANCE, CLEAR_MAX_CHANCE);
}

interface PenaltyCall {
  seconds: number;
  releasable: boolean;
  label: string;
}

const TECHNICAL_FOULS = ['Holding', 'Interference', 'Pushing', 'Illegal procedure'];
const PERSONAL_FOULS = ['Slashing', 'Cross-check', 'Tripping', 'Illegal body check'];

/** Technical fouls are 30 seconds and released by a goal; personal fouls are a minute or more and served in full. */
function rollPenalty(rng: () => number): PenaltyCall {
  const roll = rng();
  if (roll < 0.62) return { seconds: 30, releasable: true, label: pickOne(rng, TECHNICAL_FOULS) };
  if (roll < 0.96) return { seconds: 60, releasable: false, label: pickOne(rng, PERSONAL_FOULS) };
  return { seconds: 120, releasable: false, label: 'Unnecessary roughness' };
}

const SETTLED_GOAL_PHRASES = ['buries a step-down rip', 'finishes after a slick feed', 'beats the goalie stick side high', 'bounces one in from the alley'];
const TRANSITION_GOAL_PHRASES = ['scores on a fast break', 'finishes the odd-man rush', 'beats the slide in transition'];

function scoringPhrasesForTactics(tactics: Tactics, transition: boolean): string[] {
  if (transition) return TRANSITION_GOAL_PHRASES;
  if (tactics.offenseSet === 'motion') {
    return [...SETTLED_GOAL_PHRASES, 'spins one extra pass before snapping home', 'finishes after crisp off-ball movement'];
  }
  if (tactics.offenseSet === 'invert') {
    return [...SETTLED_GOAL_PHRASES, 'gets downhill from up top and tucks it inside', 'wins the midfield mismatch for a clean finish'];
  }
  if (tactics.offenseSet === 'crease') {
    return [...SETTLED_GOAL_PHRASES, 'takes a dump-off on the doorstep', 'finishes as the crease cutter'];
  }
  return SETTLED_GOAL_PHRASES;
}

function resolveGameplayModifiers(input: TeamSimInput): EffectiveGameplayModifiers {
  if (!input.gameplan) {
    return { ...ZERO_GAMEPLAN };
  }

  return {
    offense: input.gameplan.offense ?? 0,
    defense: input.gameplan.defense ?? 0,
    goalie: input.gameplan.goalie ?? 0,
    faceoff: input.gameplan.faceoff ?? 0,
    discipline: input.gameplan.discipline ?? 0,
    shotQuality: input.gameplan.shotQuality ?? 0,
    turnoverAvoidance: input.gameplan.turnoverAvoidance ?? 0,
    penaltyAvoidance: input.gameplan.penaltyAvoidance ?? 0,
    groundBallBonus: input.gameplan.groundBallBonus ?? 0,
  };
}

/** Last-resort winner if sudden death somehow never produces a goal. */
export function resolveDeadlockWinner(
  rng: () => number,
  teamAStrength: number,
  teamBStrength: number,
): 'A' | 'B' {
  const overtimeEdge = teamAStrength - teamBStrength;
  const chanceA = clamp(OVERTIME_BASE_WIN_CHANCE + overtimeEdge / OVERTIME_EDGE_DIVISOR, OVERTIME_MIN_WIN_CHANCE, OVERTIME_MAX_WIN_CHANCE);
  return rng() < chanceA ? 'A' : 'B';
}

const HOME_FIELD_OFFENSE = 2.6;
const HOME_FIELD_DEFENSE = 2.2;
const HOME_FIELD_FACEOFF = 2;
const HOME_FIELD_DISCIPLINE = 0.6;

type Side = 'A' | 'B';

/** How the next possession starts: off a draw, in the offense's own end (needs a clear), or already over midfield. */
type PossessionStart = 'faceoff' | 'clear' | 'settled';

interface SideState {
  input: TeamSimInput;
  ratings: TeamRatings;
  mods: EffectiveGameplayModifiers;
  tactics: Tactics;
  stats: TeamGameStats;
  playerStats: Map<string, PlayerGameStats>;
  faceoffForm: number;
}

/**
 * Plays one game as a sequence of events: a draw after every goal and at the start of
 * each period, clears out of the defensive end, settled possessions that can produce
 * several shots under the shot clock, and sudden-death overtime.
 */
export function simulateGame(
  teamA: TeamSimInput,
  teamB: TeamSimInput,
  tacticsA: Tactics,
  tacticsB: Tactics,
  seed: number,
  options?: { homeAdvantageForA?: boolean },
): GameResult {
  const rng = makeRng(seed);
  const homeAdvantageForA = options?.homeAdvantageForA ?? true;
  const modifiersA = resolveGameplayModifiers(teamA);
  const modifiersB = resolveGameplayModifiers(teamB);

  if (homeAdvantageForA) {
    modifiersA.offense += HOME_FIELD_OFFENSE;
    modifiersA.defense += HOME_FIELD_DEFENSE;
    modifiersA.faceoff += HOME_FIELD_FACEOFF;
    modifiersA.discipline += HOME_FIELD_DISCIPLINE;
  }

  function blankStats(input: TeamSimInput, mods: EffectiveGameplayModifiers, tactics: Tactics): TeamGameStats {
    // Loose balls the box score credits outside the modeled events (dropped passes, scrums after whistles).
    const scrums = Math.max(0, randInt(rng, 3, 7) + Math.round(mods.groundBallBonus + schemeGroundBallEdge(tactics)));
    return {
      teamId: input.team.id,
      goals: 0,
      shots: 0,
      saves: 0,
      turnovers: 0,
      causedTurnovers: 0,
      groundBalls: scrums,
      penalties: 0,
      faceoffPct: 50,
      shotsOnGoal: 0,
      faceoffWins: 0,
      faceoffsTaken: 0,
      clearsMade: 0,
      clearAttempts: 0,
      extraManGoals: 0,
      extraManOpportunities: 0,
    };
  }

  const sideA: SideState = {
    input: teamA,
    ratings: calcRatings(teamA.roster, teamA.starterIds),
    mods: modifiersA,
    tactics: tacticsA,
    stats: blankStats(teamA, modifiersA, tacticsA),
    playerStats: new Map(),
    faceoffForm: normalish(rng) * FACEOFF_FORM_VARIANCE,
  };
  const sideB: SideState = {
    input: teamB,
    ratings: calcRatings(teamB.roster, teamB.starterIds),
    mods: modifiersB,
    tactics: tacticsB,
    stats: blankStats(teamB, modifiersB, tacticsB),
    playerStats: new Map(),
    faceoffForm: normalish(rng) * FACEOFF_FORM_VARIANCE,
  };
  const sides: Record<Side, SideState> = { A: sideA, B: sideB };
  const other = (side: Side): Side => (side === 'A' ? 'B' : 'A');

  const priorityHighlights: string[] = [];
  /** Every play, in order. Period markers always survive the trim to MAX_PLAY_HIGHLIGHTS. */
  const plays: Array<{ line: string; marker: boolean }> = [];
  let scoringRunSide: Side | null = null;
  let scoringRunLength = 0;
  let scoringRunClock = '';

  /** A run is reported once, when it ends, at its full length. */
  function closeScoringRun(): void {
    if (scoringRunSide && scoringRunLength >= MIN_SCORING_RUN_FOR_HIGHLIGHT) {
      priorityHighlights.push(`${scoringRunClock} — ${sides[scoringRunSide].input.team.schoolName} on a ${scoringRunLength}-goal run.`);
    }
  }

  // Clock state. `elapsed` is seconds into regulation, or into the current overtime period.
  let elapsed = 0;
  let overtimePeriod = 0;
  /** A possession can run past the horn; its events still belong to the period it started in. */
  let periodEndForClock = PERIOD_LENGTH_SECONDS;
  /** Penalty time each side still has to serve, in seconds. It carries over between periods. */
  const penaltyLeft: Record<Side, number> = { A: 0, B: 0 };
  const penaltyReleasable: Record<Side, boolean> = { A: false, B: false };

  function advanceClock(seconds: number): void {
    elapsed += seconds;
    penaltyLeft.A = Math.max(0, penaltyLeft.A - seconds);
    penaltyLeft.B = Math.max(0, penaltyLeft.B - seconds);
  }

  /** True while `side` has the extra man: the other side is serving time and it is not. */
  function hasManUp(side: Side): boolean {
    return penaltyLeft[other(side)] > 0 && penaltyLeft[side] === 0;
  }

  function clockLabel(): string {
    // Just short of the horn, so a play at the buzzer reads "Q1 0:00" rather than the next period's "15:00".
    const c = clockAtElapsed(Math.min(elapsed, periodEndForClock - 0.4), overtimePeriod > 0 ? { overtimePeriod } : undefined);
    return `${c.label} ${c.time}`;
  }

  function addPlay(line: string): void {
    plays.push({ line: `${clockLabel()} — ${line}`, marker: false });
  }

  function ensurePlayerStats(side: SideState, player: Player): PlayerGameStats {
    const existing = side.playerStats.get(player.id);
    if (existing) return existing;
    const created: PlayerGameStats = {
      playerId: player.id,
      teamId: side.input.team.id,
      name: player.name,
      position: player.position,
      goals: 0,
      assists: 0,
      saves: 0,
      shots: 0,
      groundBalls: 0,
      causedTurnovers: 0,
    };
    side.playerStats.set(player.id, created);
    return created;
  }

  function creditGroundBall(side: SideState, player?: Player): void {
    side.stats.groundBalls += 1;
    const who = player ?? drawFromPool(rng, side.ratings.scrappers, side.ratings.goaliePlayer);
    const row = ensurePlayerStats(side, who);
    row.groundBalls = (row.groundBalls ?? 0) + 1;
  }

  function creditCausedTurnover(side: SideState): void {
    side.stats.causedTurnovers = (side.stats.causedTurnovers ?? 0) + 1;
    const who = drawFromPool(rng, side.ratings.defenders, side.ratings.goaliePlayer);
    const row = ensurePlayerStats(side, who);
    row.causedTurnovers = (row.causedTurnovers ?? 0) + 1;
  }

  function assessPenalty(fouling: Side): void {
    const call = rollPenalty(rng);
    const foulingSide = sides[fouling];
    const otherSide = sides[other(fouling)];
    foulingSide.stats.penalties += 1;
    if (penaltyLeft[fouling] === 0) {
      otherSide.stats.extraManOpportunities = (otherSide.stats.extraManOpportunities ?? 0) + 1;
      penaltyReleasable[fouling] = call.releasable;
    } else {
      penaltyReleasable[fouling] = penaltyReleasable[fouling] && call.releasable;
    }
    penaltyLeft[fouling] += call.seconds;
    if (rng() < 0.35) {
      const length = call.seconds === 30 ? '30 seconds' : call.seconds === 60 ? 'one minute' : `${call.seconds / 60} minutes`;
      addPlay(`${call.label} on ${foulingSide.input.team.schoolName}, ${length}; ${otherSide.input.team.schoolName} goes man-up.`);
    }
  }

  /** One draw. Returns the side that wins possession. */
  function faceoff(): Side {
    const edge = (sideA.ratings.faceoff + sideA.mods.faceoff - sideB.ratings.faceoff - sideB.mods.faceoff) / FACEOFF_EDGE_DIVISOR;
    const chanceA = clamp(
      0.5 + edge * FACEOFF_EDGE_WEIGHT + sideA.faceoffForm - sideB.faceoffForm,
      FACEOFF_MIN_CHANCE,
      FACEOFF_MAX_CHANCE,
    );
    const winner: Side = rng() < chanceA ? 'A' : 'B';
    const winSide = sides[winner];
    sideA.stats.faceoffsTaken = (sideA.stats.faceoffsTaken ?? 0) + 1;
    sideB.stats.faceoffsTaken = (sideB.stats.faceoffsTaken ?? 0) + 1;
    winSide.stats.faceoffWins = (winSide.stats.faceoffWins ?? 0) + 1;
    // The faceoff man takes every draw; credit both specialists.
    for (const side of [sideA, sideB]) {
      const man = side.ratings.faceoffPlayer;
      if (!man) continue;
      const row = ensurePlayerStats(side, man);
      row.faceoffsTaken = (row.faceoffsTaken ?? 0) + 1;
      if (side === winSide) row.faceoffWins = (row.faceoffWins ?? 0) + 1;
    }
    if (rng() < FACEOFF_WINNER_GROUND_BALL_CHANCE) {
      creditGroundBall(winSide, winSide.ratings.faceoffPlayer ?? undefined);
    } else {
      creditGroundBall(winSide);
    }
    advanceClock(FACEOFF_SECONDS);
    return winner;
  }

  interface PossessionOutcome {
    scored: boolean;
    next: PossessionStart;
  }

  function runPossession(offenseSide: Side, start: PossessionStart): PossessionOutcome {
    const offense = sides[offenseSide];
    const defense = sides[other(offenseSide)];
    let transition = false;

    if (start === 'clear') {
      offense.stats.clearAttempts = (offense.stats.clearAttempts ?? 0) + 1;
      advanceClock(CLEAR_SECONDS);
      const cleared = rng() < clearChance(
        offense.tactics,
        defense.tactics,
        offense.ratings.discipline + offense.mods.discipline,
        hasManUp(other(offenseSide)),
      );
      if (!cleared) {
        offense.stats.turnovers += 1;
        if (rng() < 0.5) creditCausedTurnover(defense);
        if (rng() < CAUSED_TURNOVER_GROUND_BALL_CHANCE) creditGroundBall(defense);
        if (rng() < 0.2) addPlay(`${defense.input.team.schoolName} rides it back on a failed clear.`);
        // The riding team gains it in its offensive end.
        return { scored: false, next: 'settled' };
      }
      offense.stats.clearsMade = (offense.stats.clearsMade ?? 0) + 1;
      if (defense.tactics.rideClear === 'aggressive' && rng() < BEATEN_RIDE_TRANSITION_CHANCE) transition = true;
    } else if (start === 'faceoff' && rng() < FACEOFF_FAST_BREAK_CHANCE) {
      transition = true;
    }

    const adjustedOffenseDiscipline = offense.ratings.discipline + offense.mods.discipline;
    const adjustedDefenseDiscipline = defense.ratings.discipline + defense.mods.discipline;

    const defenseSide = other(offenseSide);
    const defensiveFoulChance = clamp(
      DEFENSIVE_FOUL_BASE_CHANCE + schemeDefensiveFoulEdge(defense.tactics) - defense.mods.penaltyAvoidance
        - (adjustedDefenseDiscipline - DISCIPLINE_PIVOT) / DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR,
      PENALTY_MIN_CHANCE,
      PENALTY_MAX_CHANCE,
    );
    if (rng() < defensiveFoulChance) assessPenalty(defenseSide);

    const offensePenaltyChance = clamp(
      PENALTY_BASE_CHANCE + (DISCIPLINE_PIVOT - adjustedOffenseDiscipline) / 400 - offense.mods.penaltyAvoidance
        + schemeOffensiveFoulEdge(offense.tactics),
      PENALTY_MIN_CHANCE,
      PENALTY_MAX_CHANCE,
    );
    if (rng() < offensePenaltyChance) {
      if (rng() < OFFENSIVE_PERSONAL_FOUL_SHARE) {
        assessPenalty(offenseSide);
      } else {
        // A technical by the team with the ball just gives it away.
        offense.stats.penalties += 1;
        if (rng() < 0.25) addPlay(`${offense.input.team.schoolName} flagged for a push, possession flips.`);
      }
      advanceClock(randInt(rng, 6, 16));
      return { scored: false, next: 'settled' };
    }

    const manUpAtStart = hasManUp(offenseSide);
    const manDownAtStart = hasManUp(defenseSide);
    const disciplineGap = (DISCIPLINE_PIVOT - adjustedOffenseDiscipline) / 140;
    const forcedTurnoverChance = clamp(
      TURNOVER_BASE_CHANCE + disciplineGap - offense.mods.turnoverAvoidance
        - defense.mods.discipline / DEFENSIVE_DISCIPLINE_TURNOVER_DIVISOR
        + schemeTurnoverEdge(offense.tactics, defense.tactics),
      TURNOVER_MIN_CHANCE,
      TURNOVER_MAX_CHANCE,
    ) * (manUpAtStart ? MAN_UP_TURNOVER_SCALE : 1);

    const offensePower = offense.ratings.offense + offense.mods.offense;
    const defensePower = defense.ratings.defense + defense.mods.defense;
    const quality = (offensePower - defensePower) / SHOT_QUALITY_POWER_DIVISOR + offense.mods.shotQuality
      + schemeShotQualityEdge(offense.tactics, defense.tactics) + (transition ? TRANSITION_QUALITY_BOOST : 0)
      - (manDownAtStart ? MAN_DOWN_QUALITY_COST : 0)
      + normalish(rng) * SHOT_QUALITY_VARIANCE;
    const shotAttemptChance = clamp(
      SHOT_ATTEMPT_BASE_CHANCE + quality * 0.5 + (manUpAtStart ? MAN_UP_SHOT_BOOST : 0),
      SHOT_ATTEMPT_MIN_CHANCE,
      SHOT_ATTEMPT_MAX_CHANCE,
    );
    const goalieRating = defense.ratings.goalie + defense.mods.goalie;

    // A man-up offense attacks inside its penalty window instead of running its usual sets.
    let shotClockUsed = transition
      ? TRANSITION_SECONDS
      : manUpAtStart
        ? randInt(rng, MAN_UP_SETUP_SECONDS_MIN, MAN_UP_SETUP_SECONDS_MAX)
        : SETUP_SECONDS[offense.tactics.tempo] * (0.6 + rng() * 0.8);
    advanceClock(shotClockUsed);

    for (let attempt = 0; attempt < MAX_SHOTS_PER_POSSESSION; attempt += 1) {
      const turnoverScale = attempt === 0 ? 1 : RETAINED_POSSESSION_TURNOVER_SCALE;
      if (rng() < forcedTurnoverChance * turnoverScale) {
        offense.stats.turnovers += 1;
        creditCausedTurnover(defense);
        if (rng() < CAUSED_TURNOVER_GROUND_BALL_CHANCE) creditGroundBall(defense);
        if (rng() < 0.2) addPlay(`${defense.input.team.schoolName} forces a turnover in the alley.`);
        return { scored: false, next: 'clear' };
      }
      if (rng() > (attempt === 0 ? shotAttemptChance : shotAttemptChance - 0.08)) {
        // Unforced: a dropped feed, a pass out of bounds, or a stall that runs the clock out.
        offense.stats.turnovers += 1;
        return { scored: false, next: 'clear' };
      }
      if (shotClockUsed > MEN_SHOT_CLOCK_SECONDS) {
        offense.stats.turnovers += 1;
        if (rng() < 0.3) addPlay(`${offense.input.team.schoolName} cannot get a shot off; shot-clock violation.`);
        return { scored: false, next: 'clear' };
      }

      const shooter = drawFromPool(rng, offense.ratings.shooters, offense.ratings.goaliePlayer);
      const shooterEdge = (shooterSkill(shooter) - SHOOTER_SKILL_PIVOT) / 250;
      offense.stats.shots += 1;
      const shooterRow = ensurePlayerStats(offense, shooter);
      shooterRow.shots = (shooterRow.shots ?? 0) + 1;

      const onGoalChance = clamp(ON_GOAL_BASE_CHANCE + shooterEdge + quality * 0.3, ON_GOAL_MIN_CHANCE, ON_GOAL_MAX_CHANCE);
      if (rng() >= onGoalChance) {
        // Off target. The team closest to the ball when it leaves play keeps it.
        if (rng() < MISS_BACKUP_CHANCE + (hasManUp(offenseSide) ? MAN_UP_BACKUP_BONUS : 0)) {
          if (rng() < 0.3) creditGroundBall(offense);
          const reset = randInt(rng, RESET_SECONDS_MIN, RESET_SECONDS_MAX);
          shotClockUsed += reset;
          advanceClock(reset);
          continue;
        }
        if (rng() < 0.3) creditGroundBall(defense);
        return { scored: false, next: 'clear' };
      }

      offense.stats.shotsOnGoal = (offense.stats.shotsOnGoal ?? 0) + 1;
      const manUpNow = hasManUp(offenseSide);
      const goalChance = clamp(
        GOAL_BASE_CHANCE + (offensePower - goalieRating) / 400 + (shooterSkill(shooter) - SHOOTER_SKILL_PIVOT) / 300 + quality * 0.35 + (manUpNow ? MAN_UP_GOAL_BOOST : 0),
        GOAL_MIN_CHANCE,
        GOAL_MAX_CHANCE,
      );

      if (rng() >= goalChance) {
        defense.stats.saves += 1;
        ensurePlayerStats(defense, defense.ratings.goaliePlayer).saves += 1;
        if (rng() < 0.08) addPlay(`${defense.ratings.goaliePlayer.name} robs ${shooter.name} from point-blank range.`);
        if (rng() < SAVE_REBOUND_CHANCE) {
          // Rebound spills loose: a ground-ball battle in front of the cage.
          if (rng() < LOOSE_BALL_GROUND_BALL_CHANCE) {
            creditGroundBall(offense);
            // A shot on cage resets the shot clock.
            const reset = randInt(rng, RESET_SECONDS_MIN, RESET_SECONDS_MAX);
            shotClockUsed = reset;
            advanceClock(reset);
            continue;
          }
          creditGroundBall(defense);
        }
        return { scored: false, next: 'clear' };
      }

      offense.stats.goals += 1;
      ensurePlayerStats(offense, shooter).goals += 1;
      if (manUpNow) {
        offense.stats.extraManGoals = (offense.stats.extraManGoals ?? 0) + 1;
        // A goal releases a technical foul early.
        if (penaltyReleasable[defenseSide]) penaltyLeft[defenseSide] = 0;
      }
      let assistName: string | null = null;
      if (rng() < ASSIST_CHANCE && !transition) {
        const feeder = drawFromPool(rng, offense.ratings.feeders, shooter, shooter);
        if (feeder.id !== shooter.id) {
          ensurePlayerStats(offense, feeder).assists += 1;
          assistName = feeder.name;
        }
      }

      if (scoringRunSide === offenseSide) {
        scoringRunLength += 1;
      } else {
        closeScoringRun();
        scoringRunSide = offenseSide;
        scoringRunLength = 1;
      }
      scoringRunClock = clockLabel();

      const phrase = pickOne(rng, scoringPhrasesForTactics(offense.tactics, transition));
      const manUpNote = manUpNow ? ' on the man-up' : '';
      const assistNote = assistName ? ` (assist: ${assistName})` : '';
      addPlay(`${shooter.name}, ${offense.input.team.schoolName}, ${phrase}${manUpNote}${assistNote}.`);
      return { scored: true, next: 'faceoff' };
    }

    // Ran out of looks: the shot clock expires.
    offense.stats.turnovers += 1;
    return { scored: false, next: 'clear' };
  }

  /** Plays possessions until the period clock runs out (or a goal, in sudden death). */
  function playPeriod(periodEnd: number, suddenDeath: boolean): void {
    periodEndForClock = periodEnd;
    let ball: Side = faceoff();
    let start: PossessionStart = 'faceoff';
    while (elapsed < periodEnd) {
      const outcome = runPossession(ball, start);
      if (outcome.scored) {
        if (suddenDeath) return;
        if (elapsed >= periodEnd) return;
        ball = faceoff();
        start = 'faceoff';
        continue;
      }
      ball = other(ball);
      start = outcome.next;
    }
  }

  for (let period = 1; period <= PERIODS; period += 1) {
    elapsed = (period - 1) * PERIOD_LENGTH_SECONDS;
    playPeriod(period * PERIOD_LENGTH_SECONDS, false);
    if (period < PERIODS) {
      const label = period === 2 ? 'Halftime' : `End of Q${period}`;
      plays.push({ line: `${label} — ${teamA.team.schoolName} ${sideA.stats.goals}, ${teamB.team.schoolName} ${sideB.stats.goals}.`, marker: true });
    }
  }
  elapsed = Math.min(elapsed, REGULATION_SECONDS);

  while (sideA.stats.goals === sideB.stats.goals && overtimePeriod < MAX_OVERTIME_PERIODS) {
    overtimePeriod += 1;
    elapsed = 0;
    playPeriod(OVERTIME_PERIOD_SECONDS, true);
  }

  if (sideA.stats.goals === sideB.stats.goals) {
    const strengthA = sideA.ratings.offense + sideA.mods.offense + sideA.ratings.faceoff * OVERTIME_FACEOFF_WEIGHT;
    const strengthB = sideB.ratings.offense + sideB.mods.offense + sideB.ratings.faceoff * OVERTIME_FACEOFF_WEIGHT;
    const winner = sides[resolveDeadlockWinner(rng, strengthA, strengthB)];
    winner.stats.goals += 1;
    winner.stats.shots += 1;
    winner.stats.shotsOnGoal = (winner.stats.shotsOnGoal ?? 0) + 1;
    const shooter = drawFromPool(rng, winner.ratings.shooters, winner.ratings.goaliePlayer);
    const row = ensurePlayerStats(winner, shooter);
    row.goals += 1;
    row.shots = (row.shots ?? 0) + 1;
    priorityHighlights.push(`Final — ${shooter.name} scores the sudden-death winner for ${winner.input.team.schoolName}.`);
  }

  for (const side of [sideA, sideB]) {
    const taken = Math.max(1, side.stats.faceoffsTaken ?? 0);
    side.stats.faceoffPct = Math.round(((side.stats.faceoffWins ?? 0) / taken) * 1000) / 10;
  }
  sideB.stats.faceoffPct = Math.round(1000 - sideA.stats.faceoffPct * 10) / 10;

  if (overtimePeriod > 0) {
    const winnerName = sideA.stats.goals > sideB.stats.goals ? teamA.team.schoolName : teamB.team.schoolName;
    const overtimeText = overtimePeriod === 1 ? 'OT' : `${overtimePeriod} OTs`;
    priorityHighlights.push(`Final - ${winnerName} wins in overtime (${overtimeText}).`);
  }

  closeScoringRun();

  // Trim to MAX_PLAY_HIGHLIGHTS, spread evenly across the game so the fourth quarter is not crowded out.
  const otherPlays = plays.filter((play) => !play.marker);
  const markerCount = plays.length - otherPlays.length;
  const budget = Math.max(0, MAX_PLAY_HIGHLIGHTS - markerCount);
  const keep = new Set<number>();
  if (otherPlays.length <= budget) {
    otherPlays.forEach((_, index) => keep.add(index));
  } else {
    for (let i = 0; i < budget; i += 1) keep.add(Math.floor(((i + 0.5) * otherPlays.length) / budget));
  }
  let otherIndex = 0;
  const playHighlights = plays
    .filter((play) => (play.marker ? true : keep.has(otherIndex++)))
    .map((play) => play.line);

  // The goalie in net is charged with every goal the other side scored.
  ensurePlayerStats(sideA, sideA.ratings.goaliePlayer).goalsAllowed = sideB.stats.goals;
  ensurePlayerStats(sideB, sideB.ratings.goaliePlayer).goalsAllowed = sideA.stats.goals;

  const impact = (row: PlayerGameStats) => row.goals + row.assists + row.saves;
  const topA = [...sideA.playerStats.values()].filter((row) => impact(row) > 0).sort((a, b) => impact(b) - impact(a)).slice(0, 5);
  const topB = [...sideB.playerStats.values()].filter((row) => impact(row) > 0).sort((a, b) => impact(b) - impact(a)).slice(0, 5);

  return {
    seed,
    teamAId: teamA.team.id,
    teamBId: teamB.team.id,
    teamAName: `${teamA.team.schoolName} ${teamA.team.nickname}`,
    teamBName: `${teamB.team.schoolName} ${teamB.team.nickname}`,
    scoreA: sideA.stats.goals,
    scoreB: sideB.stats.goals,
    statsA: sideA.stats,
    statsB: sideB.stats,
    topPlayersA: topA,
    topPlayersB: topB,
    highlights: [...priorityHighlights, ...playHighlights],
    boxScoreA: [...sideA.playerStats.values()],
    boxScoreB: [...sideB.playerStats.values()],
  };
}
