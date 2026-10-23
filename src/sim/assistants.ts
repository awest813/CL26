import type { PracticeFocus, Team } from '../types/sim.ts';
import { makeRng, randInt, seedToNumber } from './rng.ts';
import { drawName } from './names.ts';

/**
 * The head coach's four assistants. Each one moves a part of the program: the
 * coordinators sharpen their side of the ball (and the install that drills it),
 * the recruiting coordinator stretches recruiting hours, and the strength coach
 * keeps legs under the team. A rating of 60 is a neutral, league-average hire.
 */

export type AssistantRole = 'OFFENSE' | 'DEFENSE' | 'RECRUITING' | 'STRENGTH';

export const ASSISTANT_ROLES: AssistantRole[] = ['OFFENSE', 'DEFENSE', 'RECRUITING', 'STRENGTH'];

export const ASSISTANT_ROLE_LABELS: Record<AssistantRole, string> = {
  OFFENSE: 'Offensive coordinator',
  DEFENSE: 'Defensive coordinator',
  RECRUITING: 'Recruiting coordinator',
  STRENGTH: 'Strength and conditioning',
};

export interface AssistantCoach {
  id: string;
  name: string;
  role: AssistantRole;
  /** 40–95. */
  rating: number;
  age: number;
  /** Seasons on this staff. */
  tenure: number;
  /** Picked by the head coach after a season on staff; missing until then. */
  specialty?: AssistantSpecialty;
}

/** One specialty per assistant, two to choose from in each role. */
export type AssistantSpecialty =
  | 'SHOT_DOCTOR'
  | 'PLAY_CALLER'
  | 'GOALIE_COACH'
  | 'PRESSURE'
  | 'CLOSER'
  | 'HOMETOWN'
  | 'ENDURANCE'
  | 'RECOVERY';

export interface SpecialtyInfo {
  id: AssistantSpecialty;
  name: string;
  detail: string;
}

export const ASSISTANT_SPECIALTIES: Record<AssistantRole, [SpecialtyInfo, SpecialtyInfo]> = {
  OFFENSE: [
    { id: 'SHOT_DOCTOR', name: 'Shot doctor', detail: 'Better looks: +0.4% shot quality on game day.' },
    { id: 'PLAY_CALLER', name: 'Play caller', detail: 'The offense install hits 6% harder.' },
  ],
  DEFENSE: [
    { id: 'GOALIE_COACH', name: 'Goalie coach', detail: '+0.3 goalie on game day.' },
    { id: 'PRESSURE', name: 'Pressure scheme', detail: '+0.3 defense on game day.' },
  ],
  RECRUITING: [
    { id: 'CLOSER', name: 'Closer', detail: '+8% weekly interest with 4★ and 5★ prospects.' },
    { id: 'HOMETOWN', name: 'Hometown ties', detail: '+10% weekly interest with prospects from your region.' },
  ],
  STRENGTH: [
    { id: 'ENDURANCE', name: 'Endurance', detail: '5% less weekly fatigue build-up.' },
    { id: 'RECOVERY', name: 'Recovery', detail: '3% less late-game wear.' },
  ],
};

/** Seasons on staff before an assistant takes a specialty. */
export const SPECIALTY_TENURE = 1;

export function specialtyInfo(specialty: AssistantSpecialty | undefined): SpecialtyInfo | null {
  if (!specialty) return null;
  for (const options of Object.values(ASSISTANT_SPECIALTIES)) {
    const match = options.find((option) => option.id === specialty);
    if (match) return match;
  }
  return null;
}

/** Whether this specialty belongs to this role. */
export function specialtyFitsRole(role: AssistantRole, specialty: AssistantSpecialty): boolean {
  return ASSISTANT_SPECIALTIES[role].some((option) => option.id === specialty);
}

function hasSpecialty(staff: AssistantCoach[], specialty: AssistantSpecialty): boolean {
  return staff.some((coach) => coach.specialty === specialty && specialtyFitsRole(coach.role, specialty));
}

/** Why an assistant left after a season. */
export interface StaffDeparture {
  name: string;
  role: AssistantRole;
  rating: number;
  reason: 'head-coach' | 'retired';
  /** For a head-coaching job: where he went. */
  teamId?: string;
}

/** Rating an empty seat plays at: a graduate assistant covering the job. */
export const VACANT_RATING = 48;
const NEUTRAL_RATING = 60;
const ELITE_RATING = 95;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** -0.34 for an empty seat, 0 at 60, 1 at 95. */
export function assistantEdge(rating: number): number {
  return clamp((rating - NEUTRAL_RATING) / (ELITE_RATING - NEUTRAL_RATING), -0.6, 1);
}

function ratingFor(staff: AssistantCoach[] | null | undefined, role: AssistantRole): number {
  return staff?.find((coach) => coach.role === role)?.rating ?? VACANT_RATING;
}

export interface StaffEffects {
  offense: number;
  shotQuality: number;
  defense: number;
  goalie: number;
  /** Multiplies the week's recruiting gains. */
  recruitingMultiplier: number;
  /** Multiplies fatigue build-up (a recovery week is unaffected). */
  fatigueScale: number;
  /** Share of in-game wear taken off. */
  wearRelief: number;
  /** How much harder each install hits with the coordinator who runs it. */
  installBoost: Record<PracticeFocus, number>;
}

/** What a staff adds. No staff at all (null) adds nothing, so sims without a coach stay neutral. */
export function staffEffects(staff: AssistantCoach[] | null | undefined): StaffEffects {
  if (!staff) {
    return {
      offense: 0,
      shotQuality: 0,
      defense: 0,
      goalie: 0,
      recruitingMultiplier: 1,
      fatigueScale: 1,
      wearRelief: 0,
      installBoost: { OFFENSE: 1, DEFENSE: 1, CONDITIONING: 1, DISCIPLINE: 1 },
    };
  }
  const offense = assistantEdge(ratingFor(staff, 'OFFENSE'));
  const defense = assistantEdge(ratingFor(staff, 'DEFENSE'));
  const recruiting = assistantEdge(ratingFor(staff, 'RECRUITING'));
  const strength = assistantEdge(ratingFor(staff, 'STRENGTH'));
  return {
    offense: offense * 1.2,
    shotQuality: offense * 0.006 + (hasSpecialty(staff, 'SHOT_DOCTOR') ? 0.004 : 0),
    defense: defense * 1.2 + (hasSpecialty(staff, 'PRESSURE') ? 0.3 : 0),
    goalie: defense * 0.5 + (hasSpecialty(staff, 'GOALIE_COACH') ? 0.3 : 0),
    recruitingMultiplier: 1 + recruiting * 0.08,
    fatigueScale: 1 - strength * 0.15 - (hasSpecialty(staff, 'ENDURANCE') ? 0.05 : 0),
    wearRelief: Math.max(0, strength) * 0.05 + (hasSpecialty(staff, 'RECOVERY') ? 0.03 : 0),
    installBoost: {
      OFFENSE: 1 + offense * 0.15 + (hasSpecialty(staff, 'PLAY_CALLER') ? 0.06 : 0),
      DEFENSE: 1 + defense * 0.15,
      CONDITIONING: 1 + strength * 0.15,
      DISCIPLINE: 1,
    },
  };
}

/** One line per role on what the hire does, for the Coach Office and the hub. */
export function staffEffectLines(staff: AssistantCoach[] | null | undefined): Record<AssistantRole, string> {
  const effects = staffEffects(staff ?? []);
  const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
  const pct = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 100))}%`;
  return {
    OFFENSE: `${signed(effects.offense)} offense on game day; the offense install hits ${pct(effects.installBoost.OFFENSE - 1)} harder.`,
    DEFENSE: `${signed(effects.defense)} defense and ${signed(effects.goalie)} goalie; the defense install hits ${pct(effects.installBoost.DEFENSE - 1)} harder.`,
    RECRUITING: `${pct(effects.recruitingMultiplier - 1)} weekly recruiting interest.`,
    STRENGTH: `${pct(effects.fatigueScale - 1)} weekly fatigue build-up, ${pct(effects.wearRelief)} late-game wear; conditioning hits ${pct(effects.installBoost.CONDITIONING - 1)} harder.`,
  };
}

function assistantName(rng: () => number): string {
  return drawName(rng);
}

/** The staff a program has when a head coach arrives: better programs keep better assistants. */
export function generateStaff(team: Team, seed: number | string): AssistantCoach[] {
  return ASSISTANT_ROLES.map((role) => {
    const rng = makeRng(seedToNumber(`${seed}:staff:${team.id}:${role}`));
    return {
      id: `asst-${team.id}-${role}-${seed}`,
      name: assistantName(rng),
      role,
      rating: clamp(Math.round(42 + team.prestige * 0.33 + randInt(rng, -7, 7)), 40, 90),
      age: randInt(rng, 29, 58),
      tenure: 0,
    };
  });
}

export interface AssistantCandidate extends AssistantCoach {
  /** Lowest program prestige that gets him to take the job. */
  minPrestige: number;
}

/**
 * The assistants on the market this offseason, three per role. The best of them only
 * listen to programs of a certain standing.
 */
export function assistantCandidates(seed: number, year: number, userTeamId: string): AssistantCandidate[] {
  return ASSISTANT_ROLES.flatMap((role) =>
    [0, 1, 2].map((slot) => {
      const rng = makeRng(seedToNumber(`${seed}:${year}:${userTeamId}:candidate:${role}:${slot}`));
      // Slots run from a solid hire to a coveted one.
      const rating = clamp(Math.round(54 + slot * 9 + randInt(rng, -5, 8)), 45, 92);
      return {
        id: `cand-${year}-${role}-${slot}-${seed}`,
        name: assistantName(rng),
        role,
        rating,
        age: randInt(rng, 28, 55),
        tenure: 0,
        minPrestige: Math.max(0, Math.round((rating - 58) * 1.4 + 40)),
      };
    }),
  );
}

/**
 * One offseason for the staff: everyone ages a year, young assistants improve and old ones
 * slip, the best get hired away as head coaches (more often after a winning year), and
 * the oldest retire. Departures leave the seat empty until the head coach hires.
 */
export function advanceStaff(input: {
  staff: AssistantCoach[];
  seed: number;
  year: number;
  /** Made the field this season: the staff's names get around. */
  madePlayoffs: boolean;
  /** Programs that could hire a top assistant as head coach. */
  openings: Team[];
}): { staff: AssistantCoach[]; departures: StaffDeparture[] } {
  const departures: StaffDeparture[] = [];
  const openings = [...input.openings];
  const staff: AssistantCoach[] = [];
  for (const coach of input.staff) {
    const rng = makeRng(seedToNumber(`${input.seed}:${input.year}:staff-year:${coach.id}`));
    const age = coach.age + 1;
    const growth = age < 40 ? randInt(rng, 0, 3) : age < 55 ? randInt(rng, -1, 2) : randInt(rng, -3, 0);
    const rating = clamp(coach.rating + growth, 40, 95);
    const poachChance = rating >= 76 ? 0.12 + (input.madePlayoffs ? 0.18 : 0) + (rating - 76) * 0.01 : 0;
    const roll = rng();
    if (openings.length > 0 && roll < poachChance) {
      const pick = openings.splice(randInt(rng, 0, openings.length - 1), 1)[0];
      departures.push({ name: coach.name, role: coach.role, rating, reason: 'head-coach', teamId: pick.id });
      continue;
    }
    if (age >= 64 && rng() < 0.35 + (age - 64) * 0.1) {
      departures.push({ name: coach.name, role: coach.role, rating, reason: 'retired' });
      continue;
    }
    staff.push({ ...coach, age, rating, tenure: coach.tenure + 1 });
  }
  return { staff, departures };
}
