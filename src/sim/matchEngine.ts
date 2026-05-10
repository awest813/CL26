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
  if (tempo === 'slow') return -8;
  if (tempo === 'fast') return 8;
  return 0;
}

function offenseBoostFromTactics(tactics: Tactics): number {
  let boost = 0;
  if (tactics.rideClear === 'aggressive') boost += 1.8;
  if (tactics.rideClear === 'conservative') boost -= 1.2;
  if (tactics.slideAggression === 'late') boost += 1;
  if (tactics.slideAggression === 'early') boost -= 0.7;
  return boost;
}

function defenseBoostFromTactics(tactics: Tactics): number {
  let boost = 0;
  if (tactics.slideAggression === 'early') boost += 1.7;
  if (tactics.slideAggression === 'late') boost -= 1.3;
  if (tactics.rideClear === 'aggressive') boost += 0.8;
  return boost;
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
    return ZERO_GAMEPLAN;
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

export function simulateGame(
  teamA: TeamSimInput,
  teamB: TeamSimInput,
  tacticsA: Tactics,
  tacticsB: Tactics,
  seed: number,
): GameResult {
  const rng = makeRng(seed);
  const ratingA = calcRatings(teamA.roster, teamA.starterIds);
  const ratingB = calcRatings(teamB.roster, teamB.starterIds);
  const modifiersA = resolveGameplayModifiers(teamA);
  const modifiersB = resolveGameplayModifiers(teamB);

  const totalPossessions = Math.max(60, 78 + tempoModifier(tacticsA.tempo) + tempoModifier(tacticsB.tempo));
  const faceoffEdge = (ratingA.faceoff + modifiersA.faceoff - ratingB.faceoff - modifiersB.faceoff) / FACEOFF_EDGE_DIVISOR;
  const shareA = Math.min(0.62, Math.max(0.38, 0.5 + faceoffEdge * 0.08 + normalish(rng) * 0.03));
  const possessionsA = Math.round(totalPossessions * shareA);
  const possessionsB = totalPossessions - possessionsA;

  const statsA: TeamGameStats = { teamId: teamA.team.id, goals: 0, shots: 0, saves: 0, turnovers: 0, groundBalls: Math.max(8, randInt(rng, 22, 35) + Math.round(modifiersA.groundBallBonus)), penalties: 0, faceoffPct: Math.round(shareA * 1000) / 10 };
  const statsB: TeamGameStats = { teamId: teamB.team.id, goals: 0, shots: 0, saves: 0, turnovers: 0, groundBalls: Math.max(8, randInt(rng, 22, 35) + Math.round(modifiersB.groundBallBonus)), penalties: 0, faceoffPct: Math.round((1 - shareA) * 1000) / 10 };

  const pStatsA = new Map<string, PlayerGameStats>();
  const pStatsB = new Map<string, PlayerGameStats>();
  const highlights: string[] = [];

  function ensurePlayerStats(target: Map<string, PlayerGameStats>, player: Player, teamId: string): PlayerGameStats {
    const existing = target.get(player.id);
    if (existing) return existing;
    const created: PlayerGameStats = { playerId: player.id, teamId, name: player.name, position: player.position, goals: 0, assists: 0, saves: 0 };
    target.set(player.id, created);
    return created;
  }

  function runPossession(offenseInput: TeamSimInput, defenseInput: TeamSimInput, offenseRatings: TeamRatings, defenseRatings: TeamRatings, offenseMods: EffectiveGameplayModifiers, defenseMods: EffectiveGameplayModifiers, offenseTactics: Tactics, defenseTactics: Tactics, offenseStats: TeamGameStats, defenseStats: TeamGameStats, playerStats: Map<string, PlayerGameStats>, defensePlayerStats: Map<string, PlayerGameStats>, possessionIndex: number): void {
    const adjustedOffenseDiscipline = offenseRatings.discipline + offenseMods.discipline;
    const adjustedDefenseDiscipline = defenseRatings.discipline + defenseMods.discipline;
    const disciplineGap = (100 - adjustedOffenseDiscipline) / 140;
    const aggressiveRideTurnoverCost = offenseTactics.rideClear === 'aggressive' ? AGGRESSIVE_CLEAR_TURNOVER_COST : 0;
    const defensiveTurnoverReduction = defenseMods.discipline / DEFENSIVE_DISCIPLINE_TURNOVER_DIVISOR;
    const baseTurnoverRate = TURNOVER_BASE_CHANCE + disciplineGap;
    const turnoverAdjustments = aggressiveRideTurnoverCost - offenseMods.turnoverAvoidance - defensiveTurnoverReduction;
    const turnoverChance = Math.min(
      TURNOVER_MAX_CHANCE,
      Math.max(
        TURNOVER_MIN_CHANCE,
        baseTurnoverRate + turnoverAdjustments,
      ),
    );
    const earlySlidePenaltyCost = defenseTactics.slideAggression === 'early' ? EARLY_SLIDE_PENALTY_COST : 0;
    const defensivePenaltyDisruption = adjustedDefenseDiscipline / DEFENSIVE_DISCIPLINE_PENALTY_DIVISOR;
    const penaltyChance = Math.min(
      PENALTY_MAX_CHANCE,
      Math.max(
        PENALTY_MIN_CHANCE,
        PENALTY_BASE_CHANCE + (100 - adjustedOffenseDiscipline) / 220 + earlySlidePenaltyCost - offenseMods.penaltyAvoidance - defensivePenaltyDisruption,
      ),
    );

    if (rng() < penaltyChance) {
      offenseStats.penalties += 1;
      if (highlights.length < 20 && rng() < 0.25) {
        const c = clockForPossession(possessionIndex, totalPossessions);
        highlights.push(`Q${c.quarter} ${c.time} — ${offenseInput.team.schoolName} flagged for a push, possession flips.`);
      }
      return;
    }

    if (rng() < turnoverChance) {
      offenseStats.turnovers += 1;
      if (rng() < 0.45) {
        defenseStats.groundBalls += 1;
      }
      if (highlights.length < 20 && rng() < 0.2) {
        const c = clockForPossession(possessionIndex, totalPossessions);
        highlights.push(`Q${c.quarter} ${c.time} — ${defenseInput.team.schoolName} forces a turnover in the alley.`);
      }
      return;
    }

    const offensePower = offenseRatings.offense + offenseMods.offense + offenseBoostFromTactics(offenseTactics);
    const defensePower = defenseRatings.defense + defenseMods.defense + defenseBoostFromTactics(defenseTactics);
    const quality = (offensePower - defensePower) / SHOT_QUALITY_POWER_DIVISOR + offenseMods.shotQuality + normalish(rng) * SHOT_QUALITY_VARIANCE;

    const shotChance = Math.min(0.88, Math.max(0.48, 0.66 + quality));
    if (rng() > shotChance) {
      return;
    }

    offenseStats.shots += 1;
    const shooter = weightedPlayerForGoal(rng, offenseRatings);

    const saveChance = Math.min(0.58, Math.max(0.2, 0.34 + (defenseRatings.goalie + defenseMods.goalie - offensePower) / 180));
    const missChance = Math.min(0.22, Math.max(0.06, 0.12 - quality / 4));

    if (rng() < missChance) {
      return;
    }

    if (rng() < saveChance) {
      defenseStats.saves += 1;
      const goalieStats = ensurePlayerStats(defensePlayerStats, defenseRatings.goaliePlayer, defenseInput.team.id);
      goalieStats.saves += 1;
      return;
    }

    offenseStats.goals += 1;
    const scorerStats = ensurePlayerStats(playerStats, shooter, offenseInput.team.id);
    scorerStats.goals += 1;

    if (rng() < 0.64) {
      const assister = weightedPlayerForGoal(rng, offenseRatings);
      if (assister.id !== shooter.id) {
        const assisterStats = ensurePlayerStats(playerStats, assister, offenseInput.team.id);
        assisterStats.assists += 1;
      }
    }

    if (highlights.length < 20 && (rng() < 0.5 || offenseStats.goals <= 3)) {
      const c = clockForPossession(possessionIndex, totalPossessions);
      const phrases = ['scores on a fast break', 'buries a step-down rip', 'finishes after a slick feed', 'beats the goalie high stick'];
      highlights.push(`Q${c.quarter} ${c.time} — ${offenseInput.team.schoolName} ${pickOne(rng, phrases)}.`);
    }
  }

  for (let i = 0; i < possessionsA; i += 1) {
    runPossession(teamA, teamB, ratingA, ratingB, modifiersA, modifiersB, tacticsA, tacticsB, statsA, statsB, pStatsA, pStatsB, i);
  }

  for (let i = 0; i < possessionsB; i += 1) {
    runPossession(teamB, teamA, ratingB, ratingA, modifiersB, modifiersA, tacticsB, tacticsA, statsB, statsA, pStatsB, pStatsA, possessionsA + i);
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
      highlights.push(`Q${c.quarter} ${c.time} — ${line}`);
    }
  }

  const topA = [...pStatsA.values()].sort((a, b) => b.goals + b.assists + b.saves - (a.goals + a.assists + a.saves)).slice(0, 5);
  const topB = [...pStatsB.values()].sort((a, b) => b.goals + b.assists + b.saves - (a.goals + a.assists + a.saves)).slice(0, 5);

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
    highlights: highlights.slice(0, randInt(rng, 10, 20)),
  };
}
