import type { Recruit } from '../types/sim.ts';
import type { AssistantCoach } from './assistants.ts';
import { specialtyFitsRole } from './assistants.ts';

/**
 * Head coach perks: at level 3 of a skill-tree branch the coach picks one of two named perks.
 * The pick is for the career. Assistant specialties live with the staff in `assistants.ts`;
 * the recruiting ones meet the head coach's here, since both scale a prospect's weekly gain.
 */

export type SkillBranch = 'recruiting' | 'development' | 'operations';

export type CoachPerkId = 'PITCHMAN' | 'GRINDER' | 'YOUNG_CORE' | 'FINISHING_SCHOOL' | 'FILM_ROOM' | 'FRESH_LEGS';

export type CoachPerks = Partial<Record<SkillBranch, CoachPerkId>>;

export interface PerkInfo {
  id: CoachPerkId;
  name: string;
  detail: string;
}

/** Branch level that opens the branch's perk choice. */
export const PERK_UNLOCK_LEVEL = 3;

export const COACH_PERKS: Record<SkillBranch, [PerkInfo, PerkInfo]> = {
  recruiting: [
    { id: 'PITCHMAN', name: 'Pitchman', detail: 'Pitches land 30% harder: a good pitch gains more, a bad one costs more.' },
    { id: 'GRINDER', name: 'Grinder', detail: 'Every recruiting hour is worth 10% more interest.' },
  ],
  development: [
    { id: 'YOUNG_CORE', name: 'Young core', detail: 'Freshmen and sophomores can grow a point more each offseason.' },
    { id: 'FINISHING_SCHOOL', name: 'Finishing school', detail: 'Juniors and seniors can grow a point more each offseason.' },
  ],
  operations: [
    { id: 'FILM_ROOM', name: 'Film room', detail: '+0.25 offense and defense on game day.' },
    { id: 'FRESH_LEGS', name: 'Fresh legs', detail: '4% less late-game wear and 10% less fatigue drag.' },
  ],
};

export function perkInfo(perk: CoachPerkId | undefined): PerkInfo | null {
  if (!perk) return null;
  for (const options of Object.values(COACH_PERKS)) {
    const match = options.find((option) => option.id === perk);
    if (match) return match;
  }
  return null;
}

/** Whether this perk belongs to this branch. */
export function perkFitsBranch(branch: SkillBranch, perk: CoachPerkId): boolean {
  return COACH_PERKS[branch].some((option) => option.id === perk);
}

/** Whether the coach has this perk, picked in the branch it belongs to. */
export function hasPerk(perks: CoachPerks | null | undefined, perk: CoachPerkId): boolean {
  if (!perks) return false;
  return (Object.entries(perks) as Array<[SkillBranch, CoachPerkId | undefined]>).some(
    ([branch, picked]) => picked === perk && perkFitsBranch(branch, perk),
  );
}

/** Extra growth ceiling for a player of this class year from the development perk. */
export function perkGrowthBonus(perks: CoachPerks | null | undefined, year: number): number {
  if (year <= 2 && hasPerk(perks, 'YOUNG_CORE')) return 1;
  if (year >= 3 && hasPerk(perks, 'FINISHING_SCHOOL')) return 1;
  return 0;
}

/** What the operations perk adds on game day. */
export function perkGameDayEdges(perks: CoachPerks | null | undefined): { offense: number; defense: number; wearRelief: number; fatigueDragScale: number } {
  const filmRoom = hasPerk(perks, 'FILM_ROOM');
  const freshLegs = hasPerk(perks, 'FRESH_LEGS');
  return {
    offense: filmRoom ? 0.25 : 0,
    defense: filmRoom ? 0.25 : 0,
    wearRelief: freshLegs ? 0.04 : 0,
    fatigueDragScale: freshLegs ? 0.9 : 1,
  };
}

/** Per-prospect scaling of the user's weekly recruiting gain from perks and specialties. */
export interface RecruitingEdges {
  /** Scales the pitch's effect, good or bad. */
  pitchScale: number;
  /** Scales the hours term. */
  hourScale: number;
  /** Scales the whole gain for 4★ and 5★ prospects. */
  blueChipScale: number;
  /** Scales the whole gain for prospects from the program's region. */
  homeRegionScale: number;
  homeRegion: string | null;
}

export const NEUTRAL_RECRUITING_EDGES: RecruitingEdges = {
  pitchScale: 1,
  hourScale: 1,
  blueChipScale: 1,
  homeRegionScale: 1,
  homeRegion: null,
};

export function recruitingEdges(
  perks: CoachPerks | null | undefined,
  staff: AssistantCoach[] | null | undefined,
  homeRegion: string | null | undefined,
): RecruitingEdges {
  const coordinator = (staff ?? []).find((coach) => coach.role === 'RECRUITING');
  const specialty = coordinator?.specialty && specialtyFitsRole('RECRUITING', coordinator.specialty) ? coordinator.specialty : null;
  return {
    pitchScale: hasPerk(perks, 'PITCHMAN') ? 1.3 : 1,
    hourScale: hasPerk(perks, 'GRINDER') ? 1.1 : 1,
    blueChipScale: specialty === 'CLOSER' ? 1.08 : 1,
    homeRegionScale: specialty === 'HOMETOWN' ? 1.1 : 1,
    homeRegion: homeRegion ?? null,
  };
}

/** The whole-gain scale for one prospect: blue chips and home-region prospects. */
export function recruitEdgeScale(edges: RecruitingEdges | null | undefined, recruit: Pick<Recruit, 'stars' | 'region'>): number {
  if (!edges) return 1;
  const blueChip = recruit.stars >= 4 ? edges.blueChipScale : 1;
  const home = edges.homeRegion != null && recruit.region === edges.homeRegion ? edges.homeRegionScale : 1;
  return blueChip * home;
}
