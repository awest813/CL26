import type { Recruit, RecruitingPitch, TeamId } from '../types/sim.ts';
import { makeRng, randInt, seedToNumber } from './rng.ts';
import { regionsAreProximate } from './recruiting.ts';

export interface RecruitingWeekResult {
  interestByRecruitId: Record<string, Record<string, number>>; // recruitId -> teamId -> interest
  committedTeamByRecruitId: Record<string, TeamId | null>;
}

/** What the CPU side needs to know about a program to recruit for it. */
export interface CpuRecruitingProfile {
  prestige: number;
  region: string;
}

/** CPU programs stop chasing new commits once their class is this size. */
export const CPU_CLASS_CAP = 8;
const DEFAULT_CPU_PROFILE: CpuRecruitingProfile = { prestige: 60, region: '' };

function getGradeMultiplier(grade?: string): number {
  if (!grade) return 1.0;
  if (grade === 'A+') return 1.5;
  if (grade === 'A') return 1.35;
  if (grade === 'B+') return 1.27;
  if (grade === 'B') return 1.2;
  if (grade === 'C') return 1.0;
  if (grade === 'D') return 0.8;
  if (grade === 'F') return 0.5;
  return 1.0;
}

function getImportanceMultiplier(importance?: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  if (importance === 'HIGH') return 1.5;
  if (importance === 'MEDIUM') return 1.25;
  if (importance === 'LOW') return 1.0;
  return 0.7; // Pitching something they don't care about
}

/** How much a pitch scales the base weekly gain: what the prospect cares about times how well you sell it. */
export function pitchMultiplier(recruit: Recruit, pitch: RecruitingPitch | undefined, grade: string | undefined): number {
  if (!pitch) return 1;
  const motivation = recruit.motivations.find(m => m.pitch === pitch);
  return getImportanceMultiplier(motivation?.importance) * getGradeMultiplier(grade);
}

/**
 * How far a program's name carries with a prospect of this tier. A blue chip
 * expects a top program; a depth recruit is flattered by a big name calling.
 * 0.5x for a long shot up to 1.15x when the program outclasses the prospect.
 */
export function programPull(prestige: number, stars: number): number {
  const expectedPrestige = 45 + stars * 9;
  return Math.max(0.5, Math.min(1.15, 1 + (prestige - expectedPrestige) / 60));
}

/** Coach skill scales user gains from 0.85x at skill 40 to 1.15x at skill 99. */
export function coachSkillMultiplier(coachSkill: number): number {
  const boundedCoachSkill = Math.max(40, Math.min(99, coachSkill));
  return 0.85 + ((boundedCoachSkill - 40) / 59) * 0.3;
}

/**
 * Average weekly interest a CPU staff adds for one prospect. Prestige and geography
 * do most of the work; a recruit who wants a winner or wants to stay home leans
 * harder toward programs that sell those.
 */
export function cpuWeeklyPursuit(recruit: Recruit, profile: CpuRecruitingProfile): number {
  const prestigeTerm = Math.max(0, (profile.prestige - 45) / 10);
  const sameRegion = profile.region !== '' && profile.region === recruit.region;
  const nearRegion = !sameRegion && profile.region !== '' && regionsAreProximate(profile.region, recruit.region);
  const regionTerm = sameRegion ? 1.5 : nearRegion ? 0.75 : 0;
  const motivationTerm = recruit.motivations.reduce((sum, motivation) => {
    if (motivation.importance !== 'HIGH') return sum;
    if (motivation.pitch === 'PRESTIGE' && profile.prestige >= 78) return sum + 1;
    if (motivation.pitch === 'CHAMPIONSHIP' && profile.prestige >= 85) return sum + 1;
    if (motivation.pitch === 'PROXIMITY' && (sameRegion || nearRegion)) return sum + 1;
    if (motivation.pitch === 'PLAYING_TIME' && profile.prestige < 70) return sum + 1;
    return sum;
  }, 0);
  const starFactor = 0.4 + recruit.stars * 0.2;
  return 1 + prestigeTerm * starFactor + regionTerm + motivationTerm;
}

/**
 * How high a prospect sits on one staff's own board, fixed for the whole cycle.
 * Spreads commit timing so the class does not all land in the same week.
 */
export function cpuBoardPriority(seed: number, recruitId: string, teamId: string): number {
  const rng = makeRng(seedToNumber(`${seed}:priority:${recruitId}:${teamId}`));
  const roll = rng();
  // Skewed low: most suitors are lukewarm, a few make the prospect a priority.
  return 0.35 + roll * roll * 1.2;
}

function committedCountsByTeam(recruits: Recruit[]): Map<string, number> {
  const counts = new Map<string, number>();
  recruits.forEach((recruit) => {
    if (recruit.committedTeamId) {
      counts.set(recruit.committedTeamId, (counts.get(recruit.committedTeamId) ?? 0) + 1);
    }
  });
  return counts;
}

export function simulateRecruitingWeek(
  recruits: Recruit[],
  boardRecruitIds: string[],
  weeklyHoursByRecruitId: Record<string, number>,
  activePitchesByRecruitId: Record<string, RecruitingPitch | undefined>,
  pitchGradesByRecruitId: Record<string, string>,
  dealbreakerViolationsByRecruitId: Record<string, boolean>,
  positionNeedBonusByRecruitId: Record<string, number>,
  selectedTeamId: TeamId | null,
  seed: number,
  weekIndex: number,
  archetypeBonus: number = 1.0,
  coachSkill: number = 72,
  /** Prestige and region by program. The user's entry sets their program pull. */
  teamProfilesByTeamId: Record<string, CpuRecruitingProfile> = {},
): RecruitingWeekResult {
  const boardSet = new Set(boardRecruitIds);
  // Commits made this week count toward CPU class caps for recruits checked later.
  const classSizeByTeamId = committedCountsByTeam(recruits);

  const interestByRecruitId: Record<string, Record<string, number>> = {};
  const committedTeamByRecruitId: Record<string, TeamId | null> = {};

  recruits.forEach((recruit) => {
    // If already committed, skip logic but preserve state
    if (recruit.committedTeamId) {
      committedTeamByRecruitId[recruit.id] = recruit.committedTeamId;
      interestByRecruitId[recruit.id] = recruit.interestByTeamId;
      return;
    }

    // One stream per prospect per week, so moving hours on one target never
    // reshuffles CPU outcomes on another.
    const rng = makeRng(seedToNumber(`${seed}:${weekIndex}:${recruit.id}`));
    const nextInterestMap: Record<string, number> = { ...recruit.interestByTeamId };

    // --- 1. User Team Logic ---
    if (selectedTeamId) {
      const prevInterest = nextInterestMap[selectedTeamId] ?? 0;
      const hours = boardSet.has(recruit.id) ? weeklyHoursByRecruitId[recruit.id] ?? 0 : 0;
      const activePitch = activePitchesByRecruitId[recruit.id];
      const pitchGrade = pitchGradesByRecruitId[recruit.id];

      let weeklyGain = 0;

      if (hours > 0) {
        // Hours: 0.5 per hour (20 hours = 10 pts)
        // Stars: 0.2 per star (5 stars = 1 pt)
        // Random: -1 to +1
        const rawGain = hours * 0.5 + recruit.stars * 0.2 + (rng() * 2 - 1);

        // Archetype bonus (RECRUITER +15%, DEVELOPER -5%, TACTICIAN ±0%)
        const userProfile = teamProfilesByTeamId[selectedTeamId];
        const pull = userProfile ? programPull(userProfile.prestige, recruit.stars) : 1;
        const baseGain = rawGain * archetypeBonus * coachSkillMultiplier(coachSkill) * pull;
        const pitchBonus = baseGain * (pitchMultiplier(recruit, activePitch, pitchGrade) - 1);

        const positionNeedBonus = boardSet.has(recruit.id) ? positionNeedBonusByRecruitId[recruit.id] ?? 0 : 0;
        weeklyGain = Math.max(0, Math.round(baseGain + pitchBonus + positionNeedBonus));
      }

      // Dealbreaker penalizes the week instead of wiping earned gains.
      if (dealbreakerViolationsByRecruitId[recruit.id]) {
        weeklyGain -= 5;
      }

      const decay = boardSet.has(recruit.id) ? 0 : 2;
      const nextInterest = Math.max(0, Math.min(100, prevInterest + weeklyGain - decay));
      nextInterestMap[selectedTeamId] = nextInterest;
    }

    // --- 2. CPU Teams Logic ---
    // Each suitor works the prospect in proportion to its pull. The current CPU
    // leader presses a little harder, and a full class backs off. A focused user
    // allocation (20 hours) outpaces most suitors; only an elite staff that has
    // made the prospect a priority keeps pace.
    const cpuTeamIds = Object.keys(nextInterestMap)
      .filter((teamId) => teamId !== selectedTeamId)
      .sort();
    let cpuLeaderId: string | null = null;
    cpuTeamIds.forEach((teamId) => {
      if (cpuLeaderId === null || recruit.interestByTeamId[teamId] > recruit.interestByTeamId[cpuLeaderId]) {
        cpuLeaderId = teamId;
      }
    });

    cpuTeamIds.forEach((teamId) => {
      const prev = nextInterestMap[teamId];
      const effort = rng();
      let gain: number;
      if ((classSizeByTeamId.get(teamId) ?? 0) >= CPU_CLASS_CAP) {
        gain = -randInt(rng, 2, 4);
      } else if (effort < 0.12) {
        // Occasional quiet week or a visit that fell flat.
        gain = -randInt(rng, 0, 2);
      } else {
        const pursuit =
          cpuWeeklyPursuit(recruit, teamProfilesByTeamId[teamId] ?? DEFAULT_CPU_PROFILE) *
          cpuBoardPriority(seed, recruit.id, teamId);
        gain = Math.max(1, Math.round(pursuit * (0.5 + rng())));
        if (teamId === cpuLeaderId) gain += 1;
      }
      nextInterestMap[teamId] = Math.max(0, Math.min(100, prev + gain));
    });

    // --- 3. Commitment Check ---
    let bestTeamId: string | null = null;
    let bestInterest = -1;

    Object.entries(nextInterestMap).forEach(([teamId, interest]) => {
        if (interest >= 100) {
            if (teamId !== selectedTeamId && (classSizeByTeamId.get(teamId) ?? 0) >= CPU_CLASS_CAP) return;
            if (interest > bestInterest) {
                bestInterest = interest;
                bestTeamId = teamId;
            } else if (interest === bestInterest && bestTeamId != null) {
              // Deterministic tie-break by team id so Object key order cannot flip outcomes.
              if (teamId.localeCompare(bestTeamId) < 0) {
                bestTeamId = teamId;
              }
            }
        }
    });

    if (bestTeamId) {
      classSizeByTeamId.set(bestTeamId, (classSizeByTeamId.get(bestTeamId) ?? 0) + 1);
    }
    interestByRecruitId[recruit.id] = nextInterestMap;
    committedTeamByRecruitId[recruit.id] = bestTeamId;
  });

  return { interestByRecruitId, committedTeamByRecruitId };
}
