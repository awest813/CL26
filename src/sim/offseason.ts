import type { Player, Position, Recruit } from '../types/sim';

export interface SigningDayResult {
  signedRecruitIds: string[];
  unsignedRecruitIds: string[];
}

export interface ClassTalentSummary {
  totalStars: number;
  averageStars: number;
  blueChipCount: number;
}

const POSITION_TARGETS: Record<Position, number> = {
  A: 5,
  M: 7,
  D: 7,
  LSM: 2,
  FO: 1,
  G: 2,
};

function countRosterByPosition(roster: Player[]): Record<Position, number> {
  const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  roster.forEach((player) => {
    counts[player.position] += 1;
  });
  return counts;
}

function recruitFitScoreForSigning(
  recruit: Recruit,
  currentCounts: Record<Position, number>,
  signedCounts: Record<Position, number>,
): number {
  const position = recruit.position;
  const signedAtPosition = signedCounts[position] ?? 0;
  const projectedCount = currentCounts[position] + signedAtPosition;
  const deficit = POSITION_TARGETS[position] - projectedCount;
  const needBonus = Math.max(0, deficit) * 40;
  const surplusPenalty = Math.max(0, projectedCount - POSITION_TARGETS[position]) * 16;
  return recruit.stars * 28 + recruit.potential * 0.72 + needBonus - surplusPenalty;
}

export function resolveSigningDay(
  committedRecruits: Recruit[],
  scholarshipsAvailable: number,
  currentRoster?: Player[] | null,
): SigningDayResult {
  const ordered = [...committedRecruits];
  const takeCount = Math.max(0, Math.min(scholarshipsAvailable, ordered.length));
  const signedCounts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  const baseCounts = currentRoster ? countRosterByPosition(currentRoster) : { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };

  const signedRecruitIds: string[] = [];
  const remaining = [...ordered];
  while (signedRecruitIds.length < takeCount && remaining.length > 0) {
    remaining.sort((a, b) => {
      const scoreA = recruitFitScoreForSigning(a, baseCounts, signedCounts);
      const scoreB = recruitFitScoreForSigning(b, baseCounts, signedCounts);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.stars !== a.stars) return b.stars - a.stars;
      if (b.potential !== a.potential) return b.potential - a.potential;
      return a.id.localeCompare(b.id);
    });

    const picked = remaining.shift();
    if (!picked) break;
    signedRecruitIds.push(picked.id);
    signedCounts[picked.position] += 1;
  }

  return {
    signedRecruitIds,
    unsignedRecruitIds: ordered.filter((recruit) => !signedRecruitIds.includes(recruit.id)).map((recruit) => recruit.id),
  };
}

export function summarizeSigningClass(recruits: Recruit[]): ClassTalentSummary {
  if (recruits.length === 0) {
    return {
      totalStars: 0,
      averageStars: 0,
      blueChipCount: 0,
    };
  }

  const totalStars = recruits.reduce((sum, recruit) => sum + recruit.stars, 0);
  const blueChipCount = recruits.filter((recruit) => recruit.stars >= 4).length;

  return {
    totalStars,
    averageStars: Number((totalStars / recruits.length).toFixed(2)),
    blueChipCount,
  };
}
