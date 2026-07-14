import { GameResult, Player, PlayerGameStats, TeamGameplayModifiers, Tactics, TeamGameStats, TeamSimInput } from '../types/sim';
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

const PENALTY_BASE_CHANCE = 0.045;
const PENALTY_MIN_CHANCE = 0.015;
const PENALTY_MAX_CHANCE = 0.18;
const EARLY_SLIDE_PENALTY_COST = 0.015;
const DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR = 1600;
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
  let chance = 0;
  if (tactics.slideAggression === 'early') chance += EARLY_SLIDE_PENALTY_COST;
  if (tactics.defensePackage === 'pressure') chance += 0.012;
  if (tactics.defensePackage === 'zone') chance += 0.004;
  chance -= defenseDiscipline / DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR;
  return Math.min(0.12, Math.max(0, chance));
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

  const statsA: TeamGameStats = { teamId: teamA.team.id, goals: 0, shots: 0, saves: 0, turnovers: 0, causedTurnovers: 0, groundBalls: Math.max(4, randInt(rng, 10, 18) + Math.round(modifiersA.groundBallBonus + groundBallBonusFromTactics(tacticsA))), penalties: 0, faceoffPct: 50 };
  const statsB: TeamGameStats = { teamId: teamB.team.id, goals: 0, shots: 0, saves: 0, turnovers: 0, causedTurnovers: 0, groundBalls: Math.max(4, randInt(rng, 10, 18) + Math.round(modifiersB.groundBallBonus + groundBallBonusFromTactics(tacticsB))), penalties: 0, faceoffPct: 50 };
  let faceoffWinsA = 0;
  let faceoffWinsB = 0;

  const openingIsA = rng() < shareA;
  if (openingIsA) faceoffWinsA += 1;
  else faceoffWinsB += 1;

  const pStatsA = new Map<string, PlayerGameStats>();
  const pStatsB = new Map<string, PlayerGameStats>();
  const highlights: string[] = [];
  let scoringRunTeamId: string | null = null;
  let scoringRunLength = 0;
  let currentOvertimePeriod = 0;

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
    const defensivePenaltyDisruption = adjustedDefenseDiscipline / DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR;
    const offensePenaltyChance = Math.min(
      PENALTY_MAX_CHANCE,
      Math.max(
        PENALTY_MIN_CHANCE,
        PENALTY_BASE_CHANCE + (100 - adjustedOffenseDiscipline) / 220 - offenseMods.penaltyAvoidance - defensivePenaltyDisruption
          + penaltyModifierFromOffenseTactics(offenseTactics),
      ),
    );
    const defensePenaltyChance = defensiveFoulChanceFromTactics(defenseTactics, adjustedDefenseDiscipline);

    let manUpBoost = 0;
    if (rng() < defensePenaltyChance) {
      defenseStats.penalties += 1;
      manUpBoost = 0.04;
      if (highlights.length < 20 && rng() < 0.25) {
        highlights.push(`${clockLabel(possessionIndex)} — ${defenseInput.team.schoolName} called for an early slide.`);
      }
    }

    if (rng() < offensePenaltyChance) {
      offenseStats.penalties += 1;
      if (highlights.length < 20 && rng() < 0.25) {
        highlights.push(`${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} flagged for a push, possession flips.`);
      }
      return false;
    }

    if (rng() < turnoverChance) {
      offenseStats.turnovers += 1;
      defenseStats.causedTurnovers = (defenseStats.causedTurnovers ?? 0) + 1;
      if (rng() < 0.45) {
        defenseStats.groundBalls += 1;
      }
      if (highlights.length < 20 && rng() < 0.2) {
        highlights.push(`${clockLabel(possessionIndex)} — ${defenseInput.team.schoolName} forces a turnover in the alley.`);
      }
      return false;
    }

    const offensePower = offenseRatings.offense + offenseMods.offense + offenseBoostFromTactics(offenseTactics);
    const defensePower = defenseRatings.defense + defenseMods.defense + defenseBoostFromTactics(defenseTactics);
    const quality = (offensePower - defensePower) / SHOT_QUALITY_POWER_DIVISOR + offenseMods.shotQuality
      + shotQualityModifierFromTactics(offenseTactics) + manUpBoost + normalish(rng) * SHOT_QUALITY_VARIANCE;

    const shotChance = Math.min(0.88, Math.max(0.48, 0.66 + quality));
    if (rng() > shotChance) {
      return false;
    }

    offenseStats.shots += 1;
    const shooter = weightedPlayerForGoal(rng, offenseRatings);

    const saveChance = Math.min(0.58, Math.max(0.2, 0.34 + (defenseRatings.goalie + defenseMods.goalie - offensePower) / 180));
    const missChance = Math.min(0.22, Math.max(0.06, 0.12 - quality / 4));

    if (rng() < missChance) {
      return false;
    }

    if (rng() < saveChance) {
      defenseStats.saves += 1;
      const goalieStats = ensurePlayerStats(defensePlayerStats, defenseRatings.goaliePlayer, defenseInput.team.id);
      goalieStats.saves += 1;
      return false;
    }

    offenseStats.goals += 1;
    const scorerStats = ensurePlayerStats(playerStats, shooter, offenseInput.team.id);
    scorerStats.goals += 1;
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
      const phrases = scoringPhrasesForTactics(offenseTactics);
      highlights.push(`${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} ${pickOne(rng, phrases)}.`);
    }

    if (scoringRunLength >= MIN_SCORING_RUN_FOR_HIGHLIGHT && highlights.length < 20 && rng() < SCORING_RUN_HIGHLIGHT_CHANCE) {
      highlights.push(`${clockLabel(possessionIndex)} — ${offenseInput.team.schoolName} on a ${scoringRunLength}-goal run.`);
    }
    return true;
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

  const extraFaceoffs = Math.max(0, statsA.goals + statsB.goals);
  for (let i = 0; i < extraFaceoffs; i += 1) {
    const drawShare = computeFaceoffShare(rng, ratingA, ratingB, modifiersA, modifiersB);
    if (rng() < drawShare) faceoffWinsA += 1;
    else faceoffWinsB += 1;
  }
  const faceoffTotal = Math.max(1, faceoffWinsA + faceoffWinsB);
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
