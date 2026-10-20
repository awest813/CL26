import type { Position, Recruit, RecruitingPitch, Team } from '../types/sim.ts';
import { estimateRecruitFit, getTeamPitchGrade } from './recruiting.ts';
import { pitchMultiplier, programPull } from './recruitingWeek.ts';

export const RECRUITING_BOARD_LIMIT = 25;

export interface AutoRecruitInput {
  recruitPool: Recruit[];
  boardRecruitIds: string[];
  /** The user's program at its effective (drift-adjusted) prestige. */
  team: Team;
  /** Current-roster need; drives pitch grades exactly as the weekly sim does. */
  positionNeedByPosition: Record<Position, number>;
  /** Next year's need: returning players only, before this class. */
  classNeedByPosition: Record<Position, number>;
  scholarshipsAvailable: number;
  /** Recruiting periods still to be simulated this cycle, this one included. */
  periodsLeft: number;
  hoursCap: number;
  maxHoursPerRecruit: number;
  /** Archetype, skill tree, NIL and boosters times coach skill: what one hour is worth. */
  gainMultiplier: number;
}

export interface AutoRecruitPlan {
  adds: { recruitId: string; startingInterest: number }[];
  removals: string[];
  hoursByRecruitId: Record<string, number>;
  pitchByRecruitId: Record<string, RecruitingPitch | null>;
  /** Open board targets in the order the staff ranks them. */
  priorityIds: string[];
}

interface ScoredTarget {
  recruit: Recruit;
  /** Talent, odds, and timing. Position need is added during ranking. */
  baseScore: number;
  pitch: RecruitingPitch | null;
  perHourGain: number;
  interest: number;
}

/** Interest a prospect starts at when added to the board. */
export function boardStartingInterest(recruit: Recruit, team: Team): number {
  const fit = estimateRecruitFit(recruit, team);
  return Math.min(40, Math.round(fit * 0.4 + recruit.stars * 2));
}

function bestPitch(
  recruit: Recruit,
  team: Team,
  positionNeedByPosition: Record<Position, number>,
): { pitch: RecruitingPitch | null; multiplier: number } {
  let best: { pitch: RecruitingPitch | null; multiplier: number } = { pitch: null, multiplier: 1 };
  recruit.motivations.forEach(({ pitch }) => {
    const grade = getTeamPitchGrade(team, pitch, recruit, positionNeedByPosition);
    const multiplier = pitchMultiplier(recruit, pitch, grade);
    if (multiplier > best.multiplier) best = { pitch, multiplier };
  });
  return best;
}

function hasDealbreakerConflict(recruit: Recruit, team: Team, positionNeedByPosition: Record<Position, number>): boolean {
  if (!recruit.dealbreaker) return false;
  const grade = getTeamPitchGrade(team, recruit.dealbreaker, recruit, positionNeedByPosition);
  return grade === 'D' || grade === 'F';
}

function scoreTarget(input: AutoRecruitInput, recruit: Recruit, onBoard: boolean): ScoredTarget | null {
  const { team, positionNeedByPosition, periodsLeft, maxHoursPerRecruit, gainMultiplier } = input;
  if (hasDealbreakerConflict(recruit, team, positionNeedByPosition)) return null;

  const { pitch, multiplier } = bestPitch(recruit, team, positionNeedByPosition);
  const perHourGain = 0.5 * gainMultiplier * multiplier * programPull(team.prestige, recruit.stars);
  const weeklyGain = perHourGain * maxHoursPerRecruit;
  const interest = Math.min(
    100,
    Math.max(recruit.interestByTeamId[team.id] ?? 0, onBoard ? 0 : boardStartingInterest(recruit, team)),
  );
  const periodsToCommit = Math.ceil((100 - interest) / Math.max(1, weeklyGain));
  if (periodsToCommit > periodsLeft) return null;

  // A suitor already near 100 will likely sign the prospect before we can.
  const cpuLead = Object.entries(recruit.interestByTeamId)
    .filter(([teamId]) => teamId !== team.id)
    .reduce((max, [, value]) => Math.max(max, value), 0);
  const cpuPeriodsToCommit = Math.ceil((100 - cpuLead) / 8);
  const raceRisk = Math.max(0, cpuLead - interest) / 10 + Math.max(0, periodsToCommit - cpuPeriodsToCommit) * 4;

  const baseScore =
    recruit.stars * 10 + (recruit.potential - 60) * 0.5 + interest * 0.3 - periodsToCommit * 6 - raceRisk * 2;
  return { recruit, baseScore, pitch, perHourGain, interest };
}

/** Value of one more player at a position, given how many spots are still open there. */
function needValue(openSpots: number): number {
  if (openSpots > 0) return 12;
  if (openSpots === 0) return -6;
  return -6 + Math.max(-3, openSpots) * 10;
}

/**
 * Rank targets one pick at a time so each pick lowers the need at its position.
 * Commits already in hand count first, so a class does not pile up at one spot.
 */
function rankByClassNeed(
  scored: ScoredTarget[],
  classNeedByPosition: Record<Position, number>,
  committed: Recruit[],
): ScoredTarget[] {
  const openSpots = { ...classNeedByPosition };
  committed.forEach((recruit) => {
    openSpots[recruit.position] = (openSpots[recruit.position] ?? 0) - 1;
  });

  const remaining = [...scored];
  const ranked: ScoredTarget[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    remaining.forEach((target, index) => {
      const score = target.baseScore + needValue(openSpots[target.recruit.position] ?? 0);
      if (score > bestScore || (score === bestScore && target.recruit.id < remaining[bestIndex].recruit.id)) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const [picked] = remaining.splice(bestIndex, 1);
    ranked.push(picked);
    openSpots[picked.recruit.position] = (openSpots[picked.recruit.position] ?? 0) - 1;
  }
  return ranked;
}

/**
 * A staff plan for one recruiting period: who belongs on the board, where the
 * hours go, and which pitch to make. Hours go to the best targets you can still
 * close, never more of them than you have open scholarships, and a prospect
 * about to commit gets just the hours it takes to finish.
 */
export function planAutoRecruiting(input: AutoRecruitInput): AutoRecruitPlan {
  const { recruitPool, team, scholarshipsAvailable, hoursCap, maxHoursPerRecruit } = input;
  const poolById = new Map(recruitPool.map((recruit) => [recruit.id, recruit]));
  const board = input.boardRecruitIds.filter((id) => poolById.has(id));

  // Prospects who signed elsewhere only take up board slots.
  const removals = board.filter((id) => {
    const committedTeamId = poolById.get(id)?.committedTeamId;
    return Boolean(committedTeamId && committedTeamId !== team.id);
  });
  const kept = board.filter((id) => !removals.includes(id));
  const committedToUser = recruitPool.filter((recruit) => recruit.committedTeamId === team.id);
  const openSlots = Math.max(0, scholarshipsAvailable - committedToUser.length);

  const keptSet = new Set(kept);
  const scored = recruitPool
    .filter((recruit) => !recruit.committedTeamId)
    .map((recruit) => scoreTarget(input, recruit, keptSet.has(recruit.id)))
    .filter((target): target is ScoredTarget => target !== null);
  const ranked = rankByClassNeed(scored, input.classNeedByPosition, committedToUser);

  // Keep a deep enough board that a lost battle has a ready replacement.
  const boardGoal = Math.min(RECRUITING_BOARD_LIMIT, openSlots === 0 ? 0 : openSlots * 2 + 2);
  const openOnBoard = kept.filter((id) => !poolById.get(id)?.committedTeamId).length;
  const adds: AutoRecruitPlan['adds'] = [];
  let room = Math.min(RECRUITING_BOARD_LIMIT - kept.length, Math.max(0, boardGoal - openOnBoard));
  for (const target of ranked) {
    if (room <= 0) break;
    if (keptSet.has(target.recruit.id)) continue;
    adds.push({ recruitId: target.recruit.id, startingInterest: boardStartingInterest(target.recruit, team) });
    room -= 1;
  }

  const finalBoard = [...kept, ...adds.map((add) => add.recruitId)];
  const finalSet = new Set(finalBoard);
  const onBoard = ranked.filter((target) => finalSet.has(target.recruit.id));

  const hoursByRecruitId: Record<string, number> = Object.fromEntries(finalBoard.map((id) => [id, 0]));
  const pitchByRecruitId: AutoRecruitPlan['pitchByRecruitId'] = {};
  let hoursLeft = hoursCap;
  let funded = 0;
  for (const target of onBoard) {
    pitchByRecruitId[target.recruit.id] = target.pitch;
    if (funded >= openSlots || hoursLeft <= 0) continue;
    // Two points of cushion cover the weekly random swing.
    const hoursToClose = Math.ceil((100 - target.interest + 2) / Math.max(0.1, target.perHourGain));
    const hours = Math.min(maxHoursPerRecruit, hoursLeft, Math.max(1, hoursToClose));
    hoursByRecruitId[target.recruit.id] = hours;
    hoursLeft -= hours;
    funded += 1;
  }

  return {
    adds,
    removals,
    hoursByRecruitId,
    pitchByRecruitId,
    priorityIds: onBoard.map((target) => target.recruit.id),
  };
}
