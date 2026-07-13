import type { Player, Position, Recruit, RecruitingPitch, RecruitMotivation, Team } from '../types/sim.ts';
import { makeRng, pickOne, randInt, seedToNumber } from './rng.ts';
import namesData from '../data/names.json' with { type: 'json' };

const REGIONS = ['Northeast', 'Mid-Atlantic', 'South', 'Midwest', 'West'];
const POSITIONS: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
const PITCHES: RecruitingPitch[] = ['PLAYING_TIME', 'PROXIMITY', 'ACADEMIC', 'PRESTIGE', 'CHAMPIONSHIP', 'CAMPUS_LIFE'];
export const RECRUITING_POSITION_FILTERS: Array<Position | 'ALL'> = ['ALL', 'A', 'M', 'D', 'LSM', 'FO', 'G'];
export const PITCH_LABELS: Record<RecruitingPitch, string> = {
  PLAYING_TIME: 'Play Time',
  PROXIMITY: 'Home',
  ACADEMIC: 'Academics',
  PRESTIGE: 'Prestige',
  CHAMPIONSHIP: 'Winning',
  CAMPUS_LIFE: 'Campus',
};

export function isRecruitingPitch(value: string): value is RecruitingPitch {
  return value in PITCH_LABELS;
}
const POSITION_TARGETS: Record<Position, number> = {
  A: 5,
  M: 7,
  D: 7,
  LSM: 2,
  FO: 1,
  G: 2,
};

function shuffleInPlace<T>(rng: () => number, values: T[]): T[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
  return values;
}

export function generateRecruitPool(seed: number, count = 180): Recruit[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const starsRoll = randInt(rng, 1, 100);
    const stars = starsRoll > 96 ? 5 : starsRoll > 80 ? 4 : starsRoll > 50 ? 3 : 2;
    const potentialBase = 58 + stars * 7;
    const potential = Math.min(99, potentialBase + randInt(rng, -5, 6));

    // Generate unique motivations via Fisher–Yates shuffle
    const shuffledPitches = shuffleInPlace(rng, [...PITCHES]);
    const motivations: RecruitMotivation[] = [
      { pitch: shuffledPitches[0], importance: 'HIGH' },
      { pitch: shuffledPitches[1], importance: 'MEDIUM' },
      { pitch: shuffledPitches[2], importance: 'LOW' },
    ];

    // 10% chance of a dealbreaker matching top motivation
    const dealbreaker = rng() < 0.1 ? motivations[0].pitch : null;

    return {
      id: `recruit-${seed}-${index + 1}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      position: pickOne(rng, POSITIONS),
      stars,
      region: pickOne(rng, REGIONS),
      potential,
      committedTeamId: null,
      motivations,
      dealbreaker,
      interestByTeamId: {},
    };
  });
}

export function generateSuitors(recruit: Recruit, teams: Team[], seed: number): Record<string, number> {
  // Mix recruit id into the seed so each prospect gets unique suitor noise.
  const rng = makeRng(seedToNumber(`${seed}:${recruit.id}`));
  const suitors: Record<string, number> = {};

  // Score all teams for fit
  const scoredTeams = teams
    .map((team) => ({
      team,
      fit: estimateRecruitFit(recruit, team),
      noise: randInt(rng, -10, 10),
    }))
    .sort((a, b) => b.fit + b.noise - (a.fit + a.noise));

  // Pick top 3-5 teams as initial suitors
  const count = Math.min(scoredTeams.length, randInt(rng, 3, 5));
  for (let i = 0; i < count; i++) {
    const { team, fit } = scoredTeams[i];
    // Initial interest: 0 to 20 base + fit/10
    const startInterest = Math.max(0, Math.min(40, randInt(rng, 5, 25) + Math.round(fit / 20)));
    suitors[team.id] = startInterest;
  }

  return suitors;
}

export function estimateRecruitFit(recruit: Recruit, team: Team): number {
  const prestigeWeight = team.prestige * 0.55;
  const starWeight = recruit.stars * 8;
  const regionBonus = recruit.region === team.region ? 9 : 0;
  return Math.round(prestigeWeight + starWeight + regionBonus);
}

export function buildPositionNeedByPosition(roster?: Player[] | null): Record<Position, number> {
  const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  if (roster) {
    roster.forEach((player) => {
      counts[player.position] = (counts[player.position] ?? 0) + 1;
    });
  }

  return {
    A: POSITION_TARGETS.A - counts.A,
    M: POSITION_TARGETS.M - counts.M,
    D: POSITION_TARGETS.D - counts.D,
    LSM: POSITION_TARGETS.LSM - counts.LSM,
    FO: POSITION_TARGETS.FO - counts.FO,
    G: POSITION_TARGETS.G - counts.G,
  };
}

function playingTimeGradeFromNeed(recruit: Recruit, positionNeedByPosition?: Record<Position, number>): string {
  if (!positionNeedByPosition) return '';
  const need = positionNeedByPosition[recruit.position] ?? 0;
  if (need >= 3) return 'A+';
  if (need >= 1) return 'A';
  if (need === 0) return 'B';
  if (need <= -3) return 'D';
  return 'C';
}

export function calculateTeamGrade(team: Team, pitch: RecruitingPitch): string {
  // Simplified logic for grades
  switch (pitch) {
    case 'PLAYING_TIME':
      // Simplified: Assume team needs players if prestige is lower
      return team.prestige < 50 ? 'A+' : team.prestige < 70 ? 'B' : 'C';
    case 'PROXIMITY':
      // This needs region comparison context, simplifying to generic 'B' for now as placeholder
      // In real logic, we'd pass the recruit's region
      return 'B';
    case 'ACADEMIC':
      // Random deterministic based on name length? Or just prestige correlation
      return team.prestige > 80 ? 'A' : team.prestige > 60 ? 'B' : 'C';
    case 'PRESTIGE':
      return team.prestige > 85 ? 'A+' : team.prestige > 70 ? 'A' : team.prestige > 55 ? 'B' : 'C';
    case 'CHAMPIONSHIP':
       return team.prestige > 90 ? 'A+' : team.prestige > 75 ? 'A' : 'C';
    case 'CAMPUS_LIFE':
       return 'B+'; // Everyone has decent campus life in sim
    default:
      return 'C';
  }
}

export function getTeamPitchGrade(
  team: Team,
  pitch: RecruitingPitch,
  recruit: Recruit,
  positionNeedByPosition?: Record<Position, number>,
): string {
   if (pitch === 'PLAYING_TIME') {
       const needDrivenGrade = playingTimeGradeFromNeed(recruit, positionNeedByPosition);
       if (needDrivenGrade) return needDrivenGrade;
   }
   if (pitch === 'PROXIMITY') {
       return team.region === recruit.region ? 'A+' : 'D';
   }
   return calculateTeamGrade(team, pitch);
}
