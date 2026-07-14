import type { Player, Position, Recruit, RecruitingPitch, RecruitMotivation, Team } from '../types/sim.ts';
import { makeRng, pickOne, randInt, seedToNumber } from './rng.ts';
import namesData from '../data/names.json' with { type: 'json' };
import { LEAGUE_REGIONS } from './leagueDataValidation.ts';

const REGIONS = [...LEAGUE_REGIONS];
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

/** Neighboring regions still score as a soft proximity match. */
const REGION_NEIGHBORS: Record<string, string[]> = {
  Northeast: ['Mid-Atlantic', 'North'],
  'Mid-Atlantic': ['Northeast', 'Southeast', 'South'],
  Southeast: ['Mid-Atlantic', 'South'],
  South: ['Southeast', 'Southwest', 'Midwest', 'Mid-Atlantic'],
  Midwest: ['North', 'South', 'Southwest', 'West'],
  Southwest: ['South', 'West', 'Midwest'],
  West: ['Southwest', 'Midwest', 'North'],
  North: ['Northeast', 'Midwest', 'West'],
};

export function regionsAreProximate(teamRegion: string, recruitRegion: string): boolean {
  if (teamRegion === recruitRegion) return true;
  return (REGION_NEIGHBORS[teamRegion] ?? []).includes(recruitRegion);
}

export function proximityPitchGrade(teamRegion: string, recruitRegion: string): string {
  if (teamRegion === recruitRegion) return 'A+';
  if (regionsAreProximate(teamRegion, recruitRegion)) return 'B';
  return 'D';
}

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
  const regionBonus = team.region === recruit.region ? 9 : regionsAreProximate(team.region, recruit.region) ? 4 : 0;
  const motivationBonus = recruit.motivations.reduce((sum, motivation) => {
    if (motivation.pitch === 'PRESTIGE' && motivation.importance === 'HIGH' && team.prestige >= 78) return sum + 4;
    if (motivation.pitch === 'PROXIMITY' && motivation.importance === 'HIGH' && regionsAreProximate(team.region, recruit.region)) {
      return sum + 3;
    }
    if (motivation.pitch === 'CHAMPIONSHIP' && motivation.importance === 'HIGH' && team.prestige >= 85) return sum + 3;
    return sum;
  }, 0);
  return Math.round(prestigeWeight + starWeight + regionBonus + motivationBonus);
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

export function calculateTeamGrade(team: Team, pitch: RecruitingPitch, recruitRegion?: string): string {
  // Simplified logic for grades
  switch (pitch) {
    case 'PLAYING_TIME':
      // Simplified: Assume team needs players if prestige is lower
      return team.prestige < 50 ? 'A+' : team.prestige < 70 ? 'B' : 'C';
    case 'PROXIMITY':
      if (!recruitRegion) return 'B';
      return proximityPitchGrade(team.region, recruitRegion);
    case 'ACADEMIC':
      // Random deterministic based on name length? Or just prestige correlation
      return team.prestige > 80 ? 'A' : team.prestige > 60 ? 'B' : 'C';
    case 'PRESTIGE':
      return team.prestige > 85 ? 'A+' : team.prestige > 70 ? 'A' : team.prestige > 55 ? 'B' : team.prestige > 40 ? 'C' : 'D';
    case 'CHAMPIONSHIP':
       return team.prestige > 90 ? 'A+' : team.prestige > 75 ? 'A' : team.prestige > 55 ? 'C' : 'D';
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
       return proximityPitchGrade(team.region, recruit.region);
   }
   return calculateTeamGrade(team, pitch, recruit.region);
}
