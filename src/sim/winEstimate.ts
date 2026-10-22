import type { Tactics, TeamSimInput } from '../types/sim';
import { simulateGame } from './matchEngine.ts';
import { seedToNumber } from './rng.ts';

/** Games the estimate plays. Enough to land within a few points; small enough to run on every change. */
export const ESTIMATE_SAMPLES = 160;

/**
 * Hub matchup estimate: the real engine plays the game `samples` times with both rosters,
 * depth charts, schemes, the install, and home field, and reports how often the user wins.
 * Seeds come from `seedKey`, so the same matchup always gives the same number.
 */
export function estimateWinChance(input: {
  user: TeamSimInput;
  userTactics: Tactics;
  opponent: TeamSimInput;
  opponentTactics: Tactics;
  isHome: boolean;
  /** A neutral site (the semifinals and championship): nobody gets home field. */
  neutral?: boolean;
  seedKey: string;
  samples?: number;
}): number {
  const samples = Math.max(1, input.samples ?? ESTIMATE_SAMPLES);
  const base = seedToNumber(`estimate:${input.seedKey}`);
  let wins = 0;
  for (let i = 0; i < samples; i += 1) {
    const seed = (base + i * 7919) >>> 0;
    // The engine's home team is side A.
    const result = input.isHome
      ? simulateGame(input.user, input.opponent, input.userTactics, input.opponentTactics, seed, { homeAdvantageForA: !input.neutral })
      : simulateGame(input.opponent, input.user, input.opponentTactics, input.userTactics, seed, { homeAdvantageForA: !input.neutral });
    const userWon = input.isHome ? result.scoreA > result.scoreB : result.scoreB > result.scoreA;
    if (userWon) wins += 1;
  }
  return Math.round((wins / samples) * 100);
}
