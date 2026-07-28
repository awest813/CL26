import { GameResult, Player, PlayerGameStats, TeamGameplayModifiers, Tactics, TeamGameStats, TeamSimInput } from '../types/sim';
import { PERIODS } from './gameRules.ts';
import { makeRng, normalish, pickOne, randInt } from './rng.ts';
import { clockForPossession } from './timeUtils.ts';

export type { Tactics, TeamSimInput, TeamGameStats, PlayerGameStats, GameResult };

interface TeamRatings {
  offense: number;
  defense: number;
  goalie: number;
  faceoff: number;
  discipline: number;
  attackers: Player[];
  middies: Player[];
  goaliePlayer: Player;
  /** Per-player sampling weights for goals/assists (starters get more touches when set). */
  fieldPlayerWeights: Map<string, number>;
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

const TURNOVER_BASE_CHANCE = 0.15;
const TURNOVER_MIN_CHANCE = 0.06;
const TURNOVER_MAX_CHANCE = 0.34;
const AGGRESSIVE_CLEAR_TURNOVER_COST = 0.02;
const DEFENSIVE_DISCIPLINE_TURNOVER_DIVISOR = 900;
/** Share of turnovers the defense actually forces; the rest are unforced (bad feed, drop, shot-clock). */
const CAUSED_TURNOVER_SHARE = 0.42;

/**
 * Offensive technical fouls (push, ward, moving pick, crease violation) cost possession.
 * A lacrosse box score records these as turnovers, not as time-serving penalties.
 */
const OFFENSIVE_TECHNICAL_BASE_CHANCE = 0.038;
const OFFENSIVE_TECHNICAL_MIN_CHANCE = 0.008;
const OFFENSIVE_TECHNICAL_MAX_CHANCE = 0.075;
const AGGRESSIVE_SLIDE_FOUL_COST = 0.008;
/** Discipline is measured against this neutral rating, not subtracted outright. */
const NEUTRAL_DISCIPLINE = 70;
const DISCIPLINE_PENALTY_DIVISOR = 900;
/** Defensive contact fouls are the most common calls in lacrosse and drive the penalty column. */
const DEFENSIVE_FOUL_BASE_CHANCE = 0.072;
const DEFENSIVE_FOUL_MIN_CHANCE = 0.012;
const DEFENSIVE_FOUL_MAX_CHANCE = 0.11;
/** Share of defensive fouls that are timed personal fouls (the rest are :30 technicals). */
const PERSONAL_FOUL_SHARE = 0.55;
const PERSONAL_FOUL_MINUTES = 1;
const TECHNICAL_FOUL_MINUTES = 0.5;

// --- Clearing / riding -----------------------------------------------------
/** Share of possessions that begin in the defensive half and must be cleared. */
const CLEAR_REQUIRED_RATE = 0.46;
const CLEAR_BASE_CHANCE = 0.87;
const CLEAR_MIN_CHANCE = 0.62;
const CLEAR_MAX_CHANCE = 0.96;

// --- Shot sequence ---------------------------------------------------------
/** A settled possession keeps generating looks until the ball is lost or buried. */
const MAX_SHOT_ATTEMPTS = 5;
const SHOT_ATTEMPT_BASE = 0.95;
const SHOT_ATTEMPT_MIN = 0.72;
const SHOT_ATTEMPT_MAX = 0.98;
/** Shots that miss the cage entirely — NCAA teams put roughly two thirds on goal. */
const OFF_CAGE_BASE = 0.35;
const OFF_CAGE_MIN = 0.2;
const OFF_CAGE_MAX = 0.48;
const SAVE_BASE_CHANCE = 0.5;
const SAVE_MIN_CHANCE = 0.34;
const SAVE_MAX_CHANCE = 0.66;
/** Offense backs up its own miss behind the cage / rebounds a save. */
const BACKUP_RECOVERY_BASE = 0.76;
const REBOUND_RECOVERY_BASE = 0.5;
/** Wide shots that stay inbounds and get scooped rather than awarded out of bounds. */
const SHOT_STAYS_IN_PLAY_RATE = 0.45;
/** Saves the keeper controls outright — no rebound, no ground ball, straight to the clear. */
const SAVE_CONTROLLED_RATE = 0.38;
/** Loose balls after a forced turnover that get scooped by the defense. */
const CAUSED_TURNOVER_GROUND_BALL_RATE = 0.72;
const UNFORCED_TURNOVER_GROUND_BALL_RATE = 0.34;
const GROUND_BALL_EDGE_SCALE = 0.022;
const GROUND_BALL_MIN_CHANCE = 0.22;
const GROUND_BALL_MAX_CHANCE = 0.78;
/** Most draws at the X end with the winner scooping the ball cleanly. */
const FACEOFF_GROUND_BALL_RATE = 0.74;
/** Man-up carries past the possession that drew it, the way a timed penalty does. */
const MAN_UP_SHOT_QUALITY_BONUS = 0.075;
const FACEOFF_EDGE_DIVISOR = 40;
const SHOT_QUALITY_POWER_DIVISOR = 110;
const SHOT_QUALITY_VARIANCE = 0.06;
const OVERTIME_POSSESSIONS_PER_TEAM = 5;
const MAX_OVERTIME_PERIODS = 3;
const OVERTIME_FACEOFF_WEIGHT = 0.12;
const OVERTIME_BASE_WIN_CHANCE = 0.5;
const OVERTIME_EDGE_DIVISOR = 260;
const OVERTIME_MIN_WIN_CHANCE = 0.35;
const OVERTIME_MAX_WIN_CHANCE = 0.65;
const MIN_SCORING_RUN_FOR_HIGHLIGHT = 3;
const SCORING_RUN_HIGHLIGHT_CHANCE = 0.6;
const BASE_POSSESSIONS = 78;
const TEMPO_POSSESSION_SWING = 8;

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

function calcRatings(roster: Player[], starterIds?: string[]): TeamRatings {
  const starterSet = resolveStarterSet(roster, starterIds);
  const fieldPlayerWeights = new Map<string, number>();

  const attackers: Player[] = [];
  const middies: Player[] = [];

  let offWeighted = 0;
  let offDenom = 0;
  let defWeighted = 0;
  let defDenom = 0;
  let foWeighted = 0;
  let foDenom = 0;
  let disWeighted = 0;
  let disDenom = 0;

  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    const w = playerDepthWeight(p.id, starterSet);
    disWeighted += p.discipline * w;
    disDenom += w;
    fieldPlayerWeights.set(p.id, w);

    const pos = p.position;
    if (pos === 'A') {
      attackers.push(p);
      const c = p.shooting * 0.55 + p.passing * 0.25 + p.IQ * 0.2;
      offWeighted += c * w;
      offDenom += w;
    } else if (pos === 'M') {
      middies.push(p);
      const oc = p.shooting * 0.55 + p.passing * 0.25 + p.IQ * 0.2;
      const dc = p.defense * 0.6 + p.speed * 0.2 + p.IQ * 0.2;
      offWeighted += oc * w;
      offDenom += w;
      defWeighted += dc * w;
      defDenom += w;
    } else if (pos === 'D' || pos === 'LSM') {
      const dc = p.defense * 0.6 + p.speed * 0.2 + p.IQ * 0.2;
      defWeighted += dc * w;
      defDenom += w;
    } else if (pos === 'FO') {
      const fc = p.passing * 0.15 + p.speed * 0.2 + p.discipline * 0.2 + p.overall * 0.45;
      foWeighted += fc * w;
      foDenom += w;
    }
  }

  const goalies = roster.filter((p) => p.position === 'G');
  const starterGoalie = starterSet ? goalies.find((g) => starterSet.has(g.id)) : undefined;
  const goaliePlayer = starterGoalie ?? goalies[0] ?? roster[0];

  const offense = offWeighted / Math.max(offDenom, 1e-6);
  const defense = defWeighted / Math.max(defDenom, 1e-6);
  const goalie = goaliePlayer.defense * 0.7 + goaliePlayer.IQ * 0.3;
  const faceoff = foDenom > 0 ? foWeighted / foDenom : 62;
  const discipline = disWeighted / Math.max(disDenom, 1e-6);

  return {
    offense,
    defense,
    goalie,
    faceoff,
    discipline,
    attackers,
    middies,
    goaliePlayer,
    fieldPlayerWeights,
  };
}

function tempoModifier(tempo: Tactics['tempo']): number {
  if (tempo === 'slow') return -TEMPO_POSSESSION_SWING;
  if (tempo === 'fast') return TEMPO_POSSESSION_SWING;
  return 0;
}

function offenseBoostFromTactics(tactics: Tactics): number {
  let boost = 0;
  if (tactics.rideClear === 'aggressive') boost += 1.8;
  if (tactics.rideClear === 'conservative') boost -= 1.2;
  if (tactics.slideAggression === 'late') boost += 1;
  if (tactics.slideAggression === 'early') boost -= 0.7;
  if (tactics.offenseSet === 'motion') boost += 1.2;
  if (tactics.offenseSet === 'invert') boost += 1.5;
  if (tactics.offenseSet === 'crease') boost += 1;
  return boost;
}

function defenseBoostFromTactics(tactics: Tactics): number {
  let boost = 0;
  if (tactics.slideAggression === 'early') boost += 1.7;
  if (tactics.slideAggression === 'late') boost -= 1.3;
  if (tactics.rideClear === 'aggressive') boost += 0.8;
  if (tactics.defensePackage === 'zone') boost += 1.5;
  if (tactics.defensePackage === 'pressure') boost += 2.1;
  return boost;
}

function shotQualityModifierFromTactics(tactics: Tactics): number {
  if (tactics.offenseSet === 'motion') return 0.016;
  if (tactics.offenseSet === 'invert') return 0.01;
  if (tactics.offenseSet === 'crease') return 0.022;
  return 0;
}

function turnoverModifierFromTactics(tactics: Tactics): number {
  if (tactics.offenseSet === 'invert') return 0.016;
  if (tactics.offenseSet === 'motion') return -0.012;
  if (tactics.offenseSet === 'crease') return -0.004;
  return 0;
}

function pressureTurnoverBonusFromDefense(tactics: Tactics): number {
  if (tactics.defensePackage === 'pressure') return 0.02;
  if (tactics.defensePackage === 'zone') return -0.006;
  return 0;
}

function penaltyModifierFromOffenseTactics(tactics: Tactics): number {
  if (tactics.offenseSet === 'invert') return 0.004;
  if (tactics.offenseSet === 'crease') return 0.008;
  return 0;
}

function defensiveFoulChanceFromTactics(tactics: Tactics, defenseDiscipline: number): number {
  // Defensive contact fouls are the most common calls in lacrosse, so they carry a
  // real base rate; discipline trims it rather than zeroing it out.
  let chance = DEFENSIVE_FOUL_BASE_CHANCE;
  // Sliding early is a tactic, not a foul — but hard early slides draw more contact calls.
  if (tactics.slideAggression === 'early') chance += AGGRESSIVE_SLIDE_FOUL_COST;
  if (tactics.defensePackage === 'pressure') chance += 0.008;
  if (tactics.defensePackage === 'zone') chance += 0.002;
  chance -= (defenseDiscipline - NEUTRAL_DISCIPLINE) / DISCIPLINE_PENALTY_DIVISOR;
  return Math.min(DEFENSIVE_FOUL_MAX_CHANCE, Math.max(DEFENSIVE_FOUL_MIN_CHANCE, chance));
}

/** Timed personal fouls — these put the offending team a man down. */
const PERSONAL_FOULS = ['slashing', 'tripping', 'cross-check', 'an illegal body check', 'unnecessary roughness'];
/** Technical fouls by the defense — :30 if the offense has possession. */
const DEFENSIVE_TECHNICAL_FOULS = ['holding', 'interference', 'an illegal screen', 'offside'];
/** Technical fouls by the offense — immediate loss of possession. */
const OFFENSIVE_TECHNICAL_FOULS = ['a push', 'warding off', 'a moving pick', 'a crease violation', 'offside'];

function clearChanceFromTactics(clearTactics: Tactics, rideTactics: Tactics): number {
  let chance = CLEAR_BASE_CHANCE;
  // Conservative clears trade transition offense for safety; aggressive clears force the issue.
  if (clearTactics.rideClear === 'conservative') chance += 0.045;
  if (clearTactics.rideClear === 'aggressive') chance -= 0.035;
  // The opponent's ride is what actually contests the clear.
  if (rideTactics.rideClear === 'aggressive') chance -= 0.075;
  if (rideTactics.rideClear === 'conservative') chance += 0.03;
  if (rideTactics.defensePackage === 'pressure') chance -= 0.025;
  return chance;
}

/** Ground balls are contested: conditioning, scheme, and coaching all tilt the scrum. */
function groundBallEdge(mods: EffectiveGameplayModifiers, tactics: Tactics): number {
  return mods.groundBallBonus + groundBallBonusFromTactics(tactics);
}

function winsGroundBall(
  rng: () => number,
  baseChance: number,
  edgeFor: number,
  edgeAgainst: number,
): boolean {
  const chance = Math.min(
    GROUND_BALL_MAX_CHANCE,
    Math.max(GROUND_BALL_MIN_CHANCE, baseChance + (edgeFor - edgeAgainst) * GROUND_BALL_EDGE_SCALE),
  );
  return rng() < chance;
}

function groundBallBonusFromTactics(tactics: Tactics): number {
  if (tactics.defensePackage === 'pressure') return 2;
  if (tactics.defensePackage === 'zone') return -1;
  return 0;
}

function scoringPhrasesForTactics(tactics: Tactics): string[] {
  const base = ['scores on a fast break', 'buries a step-down rip', 'finishes after a slick feed', 'beats the goalie stick side high'];
  if (tactics.offenseSet === 'motion') {
    return [...base, 'spins one extra pass before snapping home', 'finishes after crisp off-ball movement'];
  }
  if (tactics.offenseSet === 'invert') {
    return [...base, 'gets downhill from up top and tucks it inside', 'wins the midfield mismatch for a clean finish'];
  }
  if (tactics.offenseSet === 'crease') {
    return [...base, 'dumps it inside for a doorstep finish', 'finds the crease cutter for an easy one'];
  }
  return base;
}

function computeFaceoffShare(
  rng: () => number,
  ratingA: TeamRatings,
  ratingB: TeamRatings,
  modifiersA: EffectiveGameplayModifiers,
  modifiersB: EffectiveGameplayModifiers,
): number {
  const faceoffEdge = (ratingA.faceoff + modifiersA.faceoff - ratingB.faceoff - modifiersB.faceoff) / FACEOFF_EDGE_DIVISOR;
  return Math.min(0.62, Math.max(0.38, 0.5 + faceoffEdge * 0.08 + normalish(rng) * 0.03));
}

function weightedPlayerForGoal(rng: () => number, ratings: TeamRatings): Player {
  const pool = [...ratings.attackers, ...ratings.middies];
  if (pool.length === 0) return ratings.goaliePlayer;
  let total = 0;
  const cumulative: number[] = [];
  for (const p of pool) {
    const w = ratings.fieldPlayerWeights.get(p.id) ?? 1;
    total += w;
    cumulative.push(total);
  }
  const r = rng() * total;
  for (let i = 0; i < cumulative.length; i++) {
    if (r <= cumulative[i]) return pool[i];
  }
  return pool[pool.length - 1];
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

export function resolveDeadlockWinner(
  rng: () => number,
  teamAStrength: number,
  teamBStrength: number,
): 'A' | 'B' {
  const overtimeEdge = teamAStrength - teamBStrength;
  const chanceA = Math.min(
    OVERTIME_MAX_WIN_CHANCE,
    Math.max(OVERTIME_MIN_WIN_CHANCE, OVERTIME_BASE_WIN_CHANCE + overtimeEdge / OVERTIME_EDGE_DIVISOR),
  );
  return rng() < chanceA ? 'A' : 'B';
}

const HOME_FIELD_OFFENSE = 1.6;
const HOME_FIELD_DEFENSE = 1.2;
const HOME_FIELD_FACEOFF = 1.4;
const HOME_FIELD_DISCIPLINE = 0.6;

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
  const ratingA = calcRatings(teamA.roster, teamA.starterIds);
  const ratingB = calcRatings(teamB.roster, teamB.starterIds);
  const modifiersA = resolveGameplayModifiers(teamA);
  const modifiersB = resolveGameplayModifiers(teamB);

  if (homeAdvantageForA) {
    modifiersA.offense += HOME_FIELD_OFFENSE;
    modifiersA.defense += HOME_FIELD_DEFENSE;
    modifiersA.faceoff += HOME_FIELD_FACEOFF;
    modifiersA.discipline += HOME_FIELD_DISCIPLINE;
  }

  const totalPossessions = Math.max(60, BASE_POSSESSIONS + tempoModifier(tacticsA.tempo) + tempoModifier(tacticsB.tempo));
  const shareA = computeFaceoffShare(rng, ratingA, ratingB, modifiersA, modifiersB);
  const possessionsA = Math.round(totalPossessions * shareA);
  const possessionsB = totalPossessions - possessionsA;

  const blankStats = (teamId: string): TeamGameStats => ({
    teamId,
    goals: 0,
    shots: 0,
    shotsOnGoal: 0,
    saves: 0,
    turnovers: 0,
    causedTurnovers: 0,
    groundBalls: 0,
    penalties: 0,
    penaltyMinutes: 0,
    faceoffsWon: 0,
    faceoffsTaken: 0,
    faceoffPct: 50,
    clearsSuccessful: 0,
    clearsAttempted: 0,
    manUpGoals: 0,
    manUpOpportunities: 0,
  });

  const statsA: TeamGameStats = blankStats(teamA.team.id);
  const statsB: TeamGameStats = blankStats(teamB.team.id);
  let faceoffWinsA = 0;
  let faceoffWinsB = 0;

  /** Resolve one draw at the X. The winner usually scoops the ground ball too. */
  function resolveFaceoff(): boolean {
    const drawShare = computeFaceoffShare(rng, ratingA, ratingB, modifiersA, modifiersB);
    const wonByA = rng() < drawShare;
    if (wonByA) faceoffWinsA += 1;
    else faceoffWinsB += 1;
    if (rng() < FACEOFF_GROUND_BALL_RATE) {
      if (wonByA) statsA.groundBalls += 1;
      else statsB.groundBalls += 1;
    }
    return wonByA;
  }

  // Opening draw of the game (quarter 1); the remaining quarters are drawn below.
  const openingIsA = resolveFaceoff();

  const pStatsA = new Map<string, PlayerGameStats>();
  const pStatsB = new Map<string, PlayerGameStats>();
  const highlights: string[] = [];
  let scoringRunTeamId: string | null = null;
  let scoringRunLength = 0;
  let currentOvertimePeriod = 0;
  /** Team still enjoying a timed man-up when the next possession starts. */
  let pendingManUpFor: string | null = null;

  function ensurePlayerStats(target: Map<string, PlayerGameStats>, player: Player, teamId: string): PlayerGameStats {
    const existing = target.get(player.id);
    if (existing) return existing;
    const created: PlayerGameStats = { playerId: player.id, teamId, name: player.name, position: player.position, goals: 0, assists: 0, saves: 0 };
    target.set(player.id, created);
    return created;
  }

  function clockLabel(possessionIndex: number): string {
    const c = clockForPossession(possessionIndex, totalPossessions, {
      overtimePeriod: currentOvertimePeriod > 0 ? currentOvertimePeriod : undefined,
    });
    return `${c.label} ${c.time}`;
  }

  function runPossession(
    offenseInput: TeamSimInput,
    defenseInput: TeamSimInput,
    offenseRatings: TeamRatings,
    defenseRatings: TeamRatings,
    offenseMods: EffectiveGameplayModifiers,
    defenseMods: EffectiveGameplayModifiers,
    offenseTactics: Tactics,
    defenseTactics: Tactics,
    offenseStats: TeamGameStats,
    defenseStats: TeamGameStats,
    playerStats: Map<string, PlayerGameStats>,
    defensePlayerStats: Map<string, PlayerGameStats>,
    possessionIndex: number,
  ): boolean {
    // A timed penalty from the previous possession is still being served.
    const carriedManUp = pendingManUpFor === offenseInput.team.id;
    if (carriedManUp) pendingManUpFor = null;
    let manUpThisPossession = carriedManUp;

    const adjustedOffenseDiscipline = offenseRatings.discipline + offenseMods.discipline;
    const adjustedDefenseDiscipline = defenseRatings.discipline + defenseMods.discipline;
    const disciplineGap = (100 - adjustedOffenseDiscipline) / 140;
    const aggressiveRideTurnoverCost = offenseTactics.rideClear === 'aggressive' ? AGGRESSIVE_CLEAR_TURNOVER_COST : 0;
    const conservativeClearBonus = offenseTactics.rideClear === 'conservative' ? 0.015 : 0;
    const defensiveTurnoverReduction = defenseMods.discipline / DEFENSIVE_DISCIPLINE_TURNOVER_DIVISOR;
    const baseTurnoverRate = TURNOVER_BASE_CHANCE + disciplineGap;
    const turnoverAdjustments = aggressiveRideTurnoverCost - conservativeClearBonus - offenseMods.turnoverAvoidance - defensiveTurnoverReduction
      + turnoverModifierFromTactics(offenseTactics) + pressureTurnoverBonusFromDefense(defenseTactics);
    const turnoverChance = Math.min(
      TURNOVER_MAX_CHANCE,
      Math.max(
        TURNOVER_MIN_CHANCE,
        baseTurnoverRate + turnoverAdjustments,
      ),
    );
    const offensePenaltyChance = Math.min(
      OFFENSIVE_TECHNICAL_MAX_CHANCE,
      Math.max(
        OFFENSIVE_TECHNICAL_MIN_CHANCE,
        OFFENSIVE_TECHNICAL_BASE_CHANCE
          - (adjustedOffenseDiscipline - NEUTRAL_DISCIPLINE) / DISCIPLINE_PENALTY_DIVISOR
          - offenseMods.penaltyAvoidance
          + penaltyModifierFromOffenseTactics(offenseTactics),
      ),
    );
    const defensePenaltyChance = defensiveFoulChanceFromTactics(defenseTactics, adjustedDefenseDiscipline);

    const offenseGbEdge = groundBallEdge(offenseMods, offenseTactics);
    const defenseGbEdge = groundBallEdge(defenseMods, defenseTactics);

    // --- Clear vs. ride ---------------------------------------------------
    // Possessions won in the defensive half have to be cleared past midfield first.
    // A broken clear is a turnover and hands the riding team the ball in the box.
    if (rng() < CLEAR_REQUIRED_RATE) {
      offenseStats.clearsAttempted = (offenseStats.clearsAttempted ?? 0) + 1;
      const clearChance = Math.min(
        CLEAR_MAX_CHANCE,
        Math.max(
          CLEAR_MIN_CHANCE,
          clearChanceFromTactics(offenseTactics, defenseTactics)
            + offenseMods.turnoverAvoidance * 0.5
            + (adjustedOffenseDiscipline - 70) / 900,
        ),
      );

      if (rng() >= clearChance) {
        offenseStats.turnovers += 1;
        defenseStats.causedTurnovers = (defenseStats.causedTurnovers ?? 0) + 1;
        defenseStats.groundBalls += 1;
        if (highlights.length < 20 && rng() < 0.3) {
          highlights.push(
            `${clockLabel(possessionIndex)} — ${defenseInput.team.schoolName} breaks up the clear and takes over in the box.`,
          );
        }
        return false;
      }
      offenseStats.clearsSuccessful = (offenseStats.clearsSuccessful ?? 0) + 1;
    }

    // --- Fouls -------------------------------------------------------------
    let manUpBoost = carriedManUp ? MAN_UP_SHOT_QUALITY_BONUS : 0;
    if (rng() < defensePenaltyChance) {
      defenseStats.penalties += 1;
      const isPersonalFoul = rng() < PERSONAL_FOUL_SHARE;
      defenseStats.penaltyMinutes = (defenseStats.penaltyMinutes ?? 0)
        + (isPersonalFoul ? PERSONAL_FOUL_MINUTES : TECHNICAL_FOUL_MINUTES);
      manUpBoost = MAN_UP_SHOT_QUALITY_BONUS;
      offenseStats.manUpOpportunities = (offenseStats.manUpOpportunities ?? 0) + 1;
      manUpThisPossession = true;
      // A timed personal foul keeps the offense a man up into the next possession.
      pendingManUpFor = isPersonalFoul ? offenseInput.team.id : null;
      if (highlights.length < 20 && rng() < 0.3) {
        const foul = isPersonalFoul ? pickOne(rng, PERSONAL_FOULS) : pickOne(rng, DEFENSIVE_TECHNICAL_FOULS);
        const consequence = isPersonalFoul ? 'a man-down' : 'a :30 penalty';
        highlights.push(
          `${clockLabel(possessionIndex)} — ${defenseInput.team.schoolName} called for ${foul}; ${consequence}.`,
        );
      }
    }

    if (rng() < offensePenaltyChance) {
      // An offensive technical is a loss of possession, recorded as a turnover.
      // It is self-inflicted, so the defense is not credited with causing it.
      offenseStats.turnovers += 1;
      if (highlights.length < 20 && rng() < 0.25) {
        highlights.push(
          `${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} whistled for ${pickOne(rng, OFFENSIVE_TECHNICAL_FOULS)}; possession flips.`,
        );
      }
      return false;
    }

    // --- Turnovers ---------------------------------------------------------
    if (rng() < turnoverChance) {
      offenseStats.turnovers += 1;
      const wasCaused = rng() < CAUSED_TURNOVER_SHARE;
      if (wasCaused) {
        defenseStats.causedTurnovers = (defenseStats.causedTurnovers ?? 0) + 1;
        if (rng() < CAUSED_TURNOVER_GROUND_BALL_RATE) defenseStats.groundBalls += 1;
        if (highlights.length < 20 && rng() < 0.2) {
          highlights.push(`${clockLabel(possessionIndex)} — ${defenseInput.team.schoolName} forces a turnover in the alley.`);
        }
      } else if (rng() < UNFORCED_TURNOVER_GROUND_BALL_RATE) {
        // Unforced: an errant feed or a dropped ball the defense scoops up.
        defenseStats.groundBalls += 1;
      }
      return false;
    }

    // --- Settled offense ---------------------------------------------------
    const offensePower = offenseRatings.offense + offenseMods.offense + offenseBoostFromTactics(offenseTactics);
    const defensePower = defenseRatings.defense + defenseMods.defense + defenseBoostFromTactics(defenseTactics);
    const quality = (offensePower - defensePower) / SHOT_QUALITY_POWER_DIVISOR + offenseMods.shotQuality
      + shotQualityModifierFromTactics(offenseTactics) + manUpBoost + normalish(rng) * SHOT_QUALITY_VARIANCE;

    const shotChance = Math.min(SHOT_ATTEMPT_MAX, Math.max(SHOT_ATTEMPT_MIN, SHOT_ATTEMPT_BASE + quality));
    const saveChance = Math.min(
      SAVE_MAX_CHANCE,
      Math.max(SAVE_MIN_CHANCE, SAVE_BASE_CHANCE + (defenseRatings.goalie + defenseMods.goalie - offensePower) / 180),
    );
    const offCageChance = Math.min(OFF_CAGE_MAX, Math.max(OFF_CAGE_MIN, OFF_CAGE_BASE - quality / 2));

    // A possession keeps producing looks while the offense backs up misses and
    // rebounds saves — this is why NCAA teams out-shoot their possession count.
    for (let attempt = 0; attempt < MAX_SHOT_ATTEMPTS; attempt += 1) {
      if (rng() > shotChance) break;

      offenseStats.shots += 1;
      const shooter = weightedPlayerForGoal(rng, offenseRatings);

      if (rng() < offCageChance) {
        // Off the cage. Most wide shots skip out of bounds and are simply awarded to
        // whoever backed up the shot — no ground ball is credited on those.
        const offenseBacksItUp = winsGroundBall(rng, BACKUP_RECOVERY_BASE, offenseGbEdge, defenseGbEdge);
        if (rng() < SHOT_STAYS_IN_PLAY_RATE) {
          if (offenseBacksItUp) offenseStats.groundBalls += 1;
          else defenseStats.groundBalls += 1;
        }
        if (offenseBacksItUp) continue;
        break;
      }

      offenseStats.shotsOnGoal = (offenseStats.shotsOnGoal ?? 0) + 1;

      if (rng() < saveChance) {
        defenseStats.saves += 1;
        const goalieStats = ensurePlayerStats(defensePlayerStats, defenseRatings.goaliePlayer, defenseInput.team.id);
        goalieStats.saves += 1;
        // A controlled save starts the clear immediately; only loose rebounds are scooped.
        if (rng() < SAVE_CONTROLLED_RATE) break;
        if (winsGroundBall(rng, REBOUND_RECOVERY_BASE, offenseGbEdge, defenseGbEdge)) {
          offenseStats.groundBalls += 1;
          continue;
        }
        defenseStats.groundBalls += 1;
        break;
      }

      offenseStats.goals += 1;
      const scorerStats = ensurePlayerStats(playerStats, shooter, offenseInput.team.id);
      scorerStats.goals += 1;
      if (manUpThisPossession || carriedManUp) {
        offenseStats.manUpGoals = (offenseStats.manUpGoals ?? 0) + 1;
      }
      if (scoringRunTeamId === offenseInput.team.id) {
        scoringRunLength += 1;
      } else {
        scoringRunTeamId = offenseInput.team.id;
        scoringRunLength = 1;
      }

      if (rng() < 0.64) {
        const assister = weightedPlayerForGoal(rng, offenseRatings);
        if (assister.id !== shooter.id) {
          const assisterStats = ensurePlayerStats(playerStats, assister, offenseInput.team.id);
          assisterStats.assists += 1;
        }
      }

      if (highlights.length < 20 && (rng() < 0.5 || offenseStats.goals <= 3)) {
        const phrases = manUpThisPossession || carriedManUp
          ? [...scoringPhrasesForTactics(offenseTactics), 'converts the extra-man look', 'cashes in on the man-up']
          : scoringPhrasesForTactics(offenseTactics);
        highlights.push(`${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} ${pickOne(rng, phrases)}.`);
      }

      if (scoringRunLength >= MIN_SCORING_RUN_FOR_HIGHLIGHT && highlights.length < 20 && rng() < SCORING_RUN_HIGHLIGHT_CHANCE) {
        highlights.push(`${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} on a ${scoringRunLength}-goal run.`);
      }
      // A goal ends the man-down; the next possession starts even strength.
      pendingManUpFor = null;
      return true;
    }

    return false;
  }

  function buildInterleavedPossessionOrder(firstIsA: boolean, countA: number, countB: number): Array<'A' | 'B'> {
    const order: Array<'A' | 'B'> = [];
    let aLeft = countA;
    let bLeft = countB;
    let turnA = firstIsA;
    while (aLeft > 0 || bLeft > 0) {
      if (turnA && aLeft > 0) {
        order.push('A');
        aLeft -= 1;
      } else if (!turnA && bLeft > 0) {
        order.push('B');
        bLeft -= 1;
      } else if (aLeft > 0) {
        order.push('A');
        aLeft -= 1;
      } else {
        order.push('B');
        bLeft -= 1;
      }
      turnA = !turnA;
    }
    return order;
  }

  const regulationOrder = buildInterleavedPossessionOrder(openingIsA, possessionsA, possessionsB);
  regulationOrder.forEach((side, possessionIndex) => {
    if (side === 'A') {
      runPossession(teamA, teamB, ratingA, ratingB, modifiersA, modifiersB, tacticsA, tacticsB, statsA, statsB, pStatsA, pStatsB, possessionIndex);
    } else {
      runPossession(teamB, teamA, ratingB, ratingA, modifiersB, modifiersA, tacticsB, tacticsA, statsB, statsA, pStatsB, pStatsA, possessionIndex);
    }
  });

  let overtimePeriods = 0;
  while (statsA.goals === statsB.goals && overtimePeriods < MAX_OVERTIME_PERIODS) {
    overtimePeriods += 1;
    currentOvertimePeriod = overtimePeriods;
    const overtimeTotalPossessions = OVERTIME_POSSESSIONS_PER_TEAM * 2;
    const overtimeShareA = computeFaceoffShare(rng, ratingA, ratingB, modifiersA, modifiersB);
    let offenseIsA = rng() < overtimeShareA;
    if (offenseIsA) faceoffWinsA += 1;
    else faceoffWinsB += 1;

    for (let i = 0; i < overtimeTotalPossessions; i += 1) {
      const possessionIndex = totalPossessions + (overtimePeriods - 1) * overtimeTotalPossessions + i;
      const scored = offenseIsA
        ? runPossession(teamA, teamB, ratingA, ratingB, modifiersA, modifiersB, tacticsA, tacticsB, statsA, statsB, pStatsA, pStatsB, possessionIndex)
        : runPossession(teamB, teamA, ratingB, ratingA, modifiersB, modifiersA, tacticsB, tacticsA, statsB, statsA, pStatsB, pStatsA, possessionIndex);

      if (scored || statsA.goals !== statsB.goals) {
        break;
      }
      offenseIsA = !offenseIsA;
    }
  }
  currentOvertimePeriod = 0;

  if (statsA.goals === statsB.goals) {
    const teamAStrength = ratingA.offense + modifiersA.offense + ratingA.faceoff * OVERTIME_FACEOFF_WEIGHT;
    const teamBStrength = ratingB.offense + modifiersB.offense + ratingB.faceoff * OVERTIME_FACEOFF_WEIGHT;
    const winnerSide = resolveDeadlockWinner(rng, teamAStrength, teamBStrength);
    if (winnerSide === 'A') {
      statsA.goals += 1;
      statsA.shots += 1;
      const shooter = weightedPlayerForGoal(rng, ratingA);
      ensurePlayerStats(pStatsA, shooter, teamA.team.id).goals += 1;
      highlights.push(`Final — ${shooter.name} scores the sudden-death winner for ${teamA.team.schoolName}.`);
    } else {
      statsB.goals += 1;
      statsB.shots += 1;
      const shooter = weightedPlayerForGoal(rng, ratingB);
      ensurePlayerStats(pStatsB, shooter, teamB.team.id).goals += 1;
      highlights.push(`Final — ${shooter.name} scores the sudden-death winner for ${teamB.team.schoolName}.`);
    }
  }

  // A draw follows every goal, and every quarter after the first starts with one.
  const remainingQuarterDraws = PERIODS - 1;
  const postGoalDraws = statsA.goals + statsB.goals;
  for (let i = 0; i < remainingQuarterDraws + postGoalDraws; i += 1) {
    resolveFaceoff();
  }

  const faceoffTotal = Math.max(1, faceoffWinsA + faceoffWinsB);
  statsA.faceoffsWon = faceoffWinsA;
  statsB.faceoffsWon = faceoffWinsB;
  statsA.faceoffsTaken = faceoffTotal;
  statsB.faceoffsTaken = faceoffTotal;
  statsA.faceoffPct = Math.round((faceoffWinsA / faceoffTotal) * 1000) / 10;
  statsB.faceoffPct = Math.round((1000 - statsA.faceoffPct * 10)) / 10;

  if (overtimePeriods > 0) {
    const winnerName = statsA.goals > statsB.goals ? teamA.team.schoolName : teamB.team.schoolName;
    const overtimeText = overtimePeriods === 1 ? 'OT' : `${overtimePeriods} OTs`;
    highlights.push(`Final - ${winnerName} wins in overtime (${overtimeText}).`);
  }

  if (highlights.length < 10) {
    const fillerCount = 10 - highlights.length;
    for (let i = 0; i < fillerCount; i += 1) {
      const c = clockForPossession(randInt(rng, 0, totalPossessions), totalPossessions);
      const line = pickOne(rng, [
        `${teamA.team.schoolName} wins a tough ground ball scrum.`,
        `${teamB.team.schoolName} clears through pressure.`,
        'Big save in tight keeps momentum alive.',
        'The ride causes chaos between the restraining lines.',
      ]);
      highlights.push(`${c.label} ${c.time} — ${line}`);
    }
  }

  const topA = [...pStatsA.values()].sort((a, b) => b.goals + b.assists + b.saves - (a.goals + a.assists + a.saves)).slice(0, 5);
  const topB = [...pStatsB.values()].sort((a, b) => b.goals + b.assists + b.saves - (a.goals + a.assists + a.saves)).slice(0, 5);

  const priorityHighlights = highlights.filter(
    (line) => /overtime|sudden-death|-goal run|OT\d?/i.test(line),
  );
  const otherHighlights = highlights.filter(
    (line) => !/overtime|sudden-death|-goal run|OT\d?/i.test(line),
  );
  const highlightBudget = Math.max(priorityHighlights.length, randInt(rng, 10, 20));
  const finalHighlights = [...priorityHighlights, ...otherHighlights].slice(0, highlightBudget);

  return {
    seed,
    teamAId: teamA.team.id,
    teamBId: teamB.team.id,
    teamAName: `${teamA.team.schoolName} ${teamA.team.nickname}`,
    teamBName: `${teamB.team.schoolName} ${teamB.team.nickname}`,
    scoreA: statsA.goals,
    scoreB: statsB.goals,
    statsA,
    statsB,
    topPlayersA: topA,
    topPlayersB: topB,
    highlights: finalHighlights,
  };
}
