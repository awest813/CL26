import type { ScoringPlay } from '../types/sim.ts';

/**
 * A game's line score and scoring summary, from the engine's goal log. Side A is the
 * engine's first team (the home side); the user's view flips it as needed.
 */

export interface LineScore {
  /** Period labels in order: Q1–Q4, then any overtime periods that had a goal. */
  periods: string[];
  goalsA: number[];
  goalsB: number[];
  totalA: number;
  totalB: number;
}

export interface ScoringPeriod {
  label: string;
  plays: ScoringPlay[];
}

const REGULATION_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

export function buildLineScore(plays: ScoringPlay[], teamAId: string): LineScore {
  const overtime = [...new Set(plays.filter((play) => play.period > 4).map((play) => play.periodLabel))];
  const periods = [...REGULATION_LABELS, ...overtime];
  const goalsA = periods.map(() => 0);
  const goalsB = periods.map(() => 0);
  plays.forEach((play) => {
    const index = periods.indexOf(play.periodLabel);
    if (index < 0) return;
    if (play.teamId === teamAId) goalsA[index] += 1;
    else goalsB[index] += 1;
  });
  return {
    periods,
    goalsA,
    goalsB,
    totalA: goalsA.reduce((sum, value) => sum + value, 0),
    totalB: goalsB.reduce((sum, value) => sum + value, 0),
  };
}

/** Goals grouped by period, in game order. */
export function scoringByPeriod(plays: ScoringPlay[]): ScoringPeriod[] {
  const groups: ScoringPeriod[] = [];
  plays.forEach((play) => {
    const last = groups[groups.length - 1];
    if (last && last.label === play.periodLabel) last.plays.push(play);
    else groups.push({ label: play.periodLabel, plays: [play] });
  });
  return groups;
}

/** Lead changes and ties after the opening goal: how back-and-forth the game was. */
export function leadChanges(plays: ScoringPlay[]): { leadChanges: number; ties: number; largestLeadA: number; largestLeadB: number } {
  let leader: 'A' | 'B' | null = null;
  let changes = 0;
  let ties = 0;
  let largestLeadA = 0;
  let largestLeadB = 0;
  plays.forEach((play) => {
    const margin = play.scoreA - play.scoreB;
    largestLeadA = Math.max(largestLeadA, margin);
    largestLeadB = Math.max(largestLeadB, -margin);
    const next = margin > 0 ? 'A' : margin < 0 ? 'B' : null;
    if (next === null) {
      ties += 1;
    } else if (leader !== null && next !== leader) {
      changes += 1;
    }
    if (next !== null) leader = next;
  });
  return { leadChanges: changes, ties, largestLeadA, largestLeadB };
}
