import type { Player } from '../types/sim';

function averageOverall(roster: Player[]): number {
  if (roster.length === 0) return 72;
  return roster.reduce((sum, player) => sum + player.overall, 0) / roster.length;
}

/**
 * Hub matchup estimate. It is not the match engine: both roster averages,
 * practice, fatigue, and home field move the number, and the game seed is unused.
 */
export function estimateWinChance(input: {
  userPrestige: number;
  userRoster: Player[];
  opponentPrestige: number;
  opponentRoster: Player[];
  offense: number;
  defense: number;
  faceoff: number;
  fatigue: number;
  isHome: boolean;
}): number {
  const rosterEdge = averageOverall(input.userRoster) - 72;
  const modEdge = input.offense + input.defense + input.faceoff * 0.5;
  const fatiguePenalty = input.fatigue * 0.08;
  const homeEdge = input.isHome ? 3 : -1;
  const userStrength = Math.max(20, input.userPrestige + rosterEdge + modEdge + homeEdge - fatiguePenalty);
  const oppStrength = Math.max(20, input.opponentPrestige + (averageOverall(input.opponentRoster) - 72));
  return Math.round((userStrength / (userStrength + oppStrength)) * 100);
}
