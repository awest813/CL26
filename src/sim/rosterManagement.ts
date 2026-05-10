import { Player, Position, SignedRecruit, Team } from '../types/sim';
import { makeRng, pickOne, randInt, seedToNumber } from './rng';
import namesData from '../data/names.json' with { type: 'json' };

const clamp = (value: number) => Math.max(40, Math.min(99, value));
const FACILITIES_BONUS_DIVISOR = 22;
const OPERATIONS_BONUS_DIVISOR = 2;
const BOOSTERS_GROWTH_THRESHOLD = 75;
const TRAIT_BUMP_PROBABILITY = 0.62;

type CoachArchetype = 'RECRUITER' | 'TACTICIAN' | 'DEVELOPER';
type PracticeFocus = 'OFFENSE' | 'DEFENSE' | 'CONDITIONING' | 'DISCIPLINE';

export interface CoachDevelopmentInputs {
  coachArchetype?: CoachArchetype;
  developmentSkill?: number;
  operationsSkill?: number;
  facilitiesLevel?: number;
  boostersLevel?: number;
}

/** Convert star rating to an approximate overall baseline */
function starsToBaseline(stars: number): number {
  // 2★ ~55, 3★ ~65, 4★ ~75, 5★ ~87
  return 43 + stars * 11;
}

function potentialBaselineBonus(potential: number | undefined, stars: number): number {
  const p = potential ?? 52 + stars * 9;
  const clamped = Math.max(40, Math.min(99, p));
  return (clamped - 72) * 0.32;
}

/** Generate a player from a signed recruit record */
export function convertRecruitToPlayer(
  signedRecruit: SignedRecruit,
  team: Team,
  rng: () => number,
): Player {
  const potBonus = potentialBaselineBonus(signedRecruit.potential, signedRecruit.stars);
  const baseline = starsToBaseline(signedRecruit.stars) + potBonus;
  const position = signedRecruit.position;

  const variance = randInt(rng, -8, 8);
  const shooting = clamp(Math.round(baseline + variance + (position === 'A' ? 8 : 0) + (position === 'M' ? 4 : 0)));
  const passing = clamp(Math.round(baseline + randInt(rng, -8, 8) + (position === 'M' ? 6 : 0) + (position === 'FO' ? -4 : 0)));
  const speed = clamp(Math.round(baseline + randInt(rng, -7, 9) + (position === 'LSM' ? 5 : 0) + (position === 'G' ? -3 : 0)));
  const defense = clamp(Math.round(baseline + randInt(rng, -9, 8) + (position === 'D' ? 10 : 0) + (position === 'LSM' ? 8 : 0) + (position === 'G' ? 6 : 0)));
  const IQ = clamp(Math.round(baseline + randInt(rng, -6, 10)));
  const stamina = clamp(Math.round(baseline + randInt(rng, -6, 7)));
  const discipline = clamp(Math.round(baseline + randInt(rng, -5, 8)));

  const overall = Math.round((shooting + passing + speed + defense + IQ + stamina + discipline) / 7);
  const skill = clamp(Math.round(overall + randInt(rng, -3, 3)));

  return {
    id: `${team.id}-recruit-${signedRecruit.recruitId}-yr1`,
    name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
    position,
    year: 1,
    age: 18,
    skill,
    shooting,
    passing,
    speed,
    defense,
    IQ,
    stamina,
    discipline,
    overall,
  };
}

/**
 * Apply player development at the end of a season.
 * Upperclassmen improve slightly; freshmen have the biggest gains.
 */
export function developPlayers(
  roster: Player[],
  rng: () => number,
  options?: CoachDevelopmentInputs,
): Player[] {
  const devBonus = options?.coachArchetype === 'DEVELOPER' ? 1 : 0;
  const developmentSkillBonus = options?.developmentSkill ?? 0;
  const facilitiesBonus = Math.floor((options?.facilitiesLevel ?? 50) / FACILITIES_BONUS_DIVISOR);
  const operationsBonus = Math.floor((options?.operationsSkill ?? 0) / OPERATIONS_BONUS_DIVISOR);
  const boostersModifier = options?.boostersLevel != null && options.boostersLevel >= BOOSTERS_GROWTH_THRESHOLD ? 1 : 0;
  const totalBonus = devBonus + developmentSkillBonus + facilitiesBonus + operationsBonus + boostersModifier;

  return roster.map((player) => {
    // Freshmen and sophomores develop more
    const growthCeiling =
      (player.year === 1 ? 5 : player.year === 2 ? 4 : player.year === 3 ? 3 : 1) + totalBonus;
    const growth = randInt(rng, 0, Math.min(9, growthCeiling));
    if (growth === 0) return player;

    const bump = (base: number) => clamp(base + randInt(rng, 0, growth));
    const shooting = bump(player.shooting);
    const passing = bump(player.passing);
    const speed = bump(player.speed);
    const defense = bump(player.defense);
    const IQ = bump(player.IQ);
    const stamina = bump(player.stamina);
    const discipline = bump(player.discipline);
    const overall = Math.round((shooting + passing + speed + defense + IQ + stamina + discipline) / 7);
    const skill = clamp(Math.round(overall + randInt(rng, -2, 2)));

    return { ...player, shooting, passing, speed, defense, IQ, stamina, discipline, overall, skill };
  });
}

function bumpPlayer(player: Player, rng: () => number, targets: Array<keyof Pick<Player, 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline'>>): Player {
  const updates: Pick<Player, 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline'> = {
    shooting: player.shooting,
    passing: player.passing,
    speed: player.speed,
    defense: player.defense,
    IQ: player.IQ,
    stamina: player.stamina,
    discipline: player.discipline,
  };

  for (const key of targets) {
    if (rng() < TRAIT_BUMP_PROBABILITY) {
      updates[key] = clamp(updates[key] + 1);
    }
  }

  const overall = Math.round(
    (updates.shooting +
      updates.passing +
      updates.speed +
      updates.defense +
      updates.IQ +
      updates.stamina +
      updates.discipline) /
      7,
  );
  const skill = clamp(Math.round(overall + randInt(rng, -2, 2)));
  return { ...player, ...updates, overall, skill };
}

export function applyWeeklyTraitGrowth(
  roster: Player[],
  weekSeed: number,
  weekIndex: number,
  practiceFocus: PracticeFocus,
  options?: CoachDevelopmentInputs & { coachSkill?: number },
): Player[] {
  if (roster.length === 0) return roster;

  const rng = makeRng(seedToNumber(JSON.stringify([weekSeed, 'weekly-growth', weekIndex, practiceFocus])));
  const coachSkill = options?.coachSkill ?? 70;
  const growthSlots = Math.max(
    2,
    Math.min(
      8,
      2 +
        Math.floor((options?.developmentSkill ?? 0) / 2) +
        Math.floor((coachSkill - 60) / 15) +
        Math.floor((options?.facilitiesLevel ?? 50) / 28),
    ),
  );

  const focusTraits: Record<PracticeFocus, Array<keyof Pick<Player, 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline'>>> = {
    OFFENSE: ['shooting', 'passing', 'IQ'],
    DEFENSE: ['defense', 'discipline', 'IQ'],
    CONDITIONING: ['speed', 'stamina'],
    DISCIPLINE: ['discipline', 'IQ', 'stamina'],
  };
  const chosenTraits = focusTraits[practiceFocus];

  const mutable = [...roster];
  for (let i = 0; i < growthSlots; i += 1) {
    const playerIndex = randInt(rng, 0, mutable.length - 1);
    const player = mutable[playerIndex];
    mutable[playerIndex] = bumpPlayer(player, rng, chosenTraits);
  }

  return mutable;
}

const POSITION_FILL_ORDER: Position[] = ['A', 'A', 'A', 'M', 'M', 'M', 'M', 'D', 'D', 'D', 'LSM', 'FO', 'G', 'A', 'M', 'D', 'M', 'D', 'A', 'M', 'D', 'LSM', 'M', 'D', 'A'];

/**
 * Apply full roster turnover for the offseason:
 * 1. Develop returning players
 * 2. Remove seniors (year === 4) and apply transfer/attrition
 * 3. Age returning players (year++)
 * 4. Add incoming signed recruits as freshmen
 * 5. Fill any remaining open spots with generated walk-ons
 */
export function applyRosterTurnover(
  currentRoster: Player[],
  signedRecruits: SignedRecruit[],
  team: Team,
  newSeed: number,
  options?: CoachDevelopmentInputs,
): Player[] {
  const rng = makeRng(seedToNumber(`${newSeed}:${team.id}:turnover`));

  // Step 1: Develop players
  const developed = developPlayers(currentRoster, rng, {
    coachArchetype: options?.coachArchetype,
    developmentSkill: options?.developmentSkill,
    operationsSkill: options?.operationsSkill,
    facilitiesLevel: options?.facilitiesLevel,
    boostersLevel: options?.boostersLevel,
  });

  // Step 2: Separate leavers from returners
  //   - Seniors (year 4) always graduate
  //   - ~10% chance each year-1,2,3 player transfers out
  const returners: Player[] = [];
  for (const player of developed) {
    if (player.year === 4) continue; // graduate
    const transferChance = player.year === 1 ? 0.08 : player.year === 2 ? 0.06 : 0.04;
    if (rng() < transferChance) continue; // transfer portal
    returners.push(player);
  }

  // Step 3: Age returning players
  const agedReturners: Player[] = returners.map((player) => ({
    ...player,
    year: (player.year + 1) as 1 | 2 | 3 | 4,
    age: player.age + 1,
  }));

  // Step 4: Convert signed recruits to freshmen
  const incomingFreshmen: Player[] = signedRecruits.map((sr) =>
    convertRecruitToPlayer(sr, team, rng),
  );

  // Step 5: Fill remaining spots with generated walk-ons up to 24 players
  const combined = [...agedReturners, ...incomingFreshmen];
  const TARGET_SIZE = 24;
  const positionsCovered = new Set(combined.map((p) => p.position));
  const baseline = 45 + team.prestige * 0.4;

  // First ensure every required position is covered
  const requiredPositions: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
  const missingPositions = requiredPositions.filter((pos) => !positionsCovered.has(pos));

  for (const pos of missingPositions) {
    const variance = randInt(rng, -10, 8);
    const overall = clamp(Math.round(baseline + variance - 5)); // walk-ons are below average
    const skill = clamp(Math.round(overall + randInt(rng, -3, 3)));
    combined.push({
      id: `${team.id}-walkon-${pos}-${newSeed}-${combined.length}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      position: pos,
      year: 1,
      age: 18,
      skill,
      shooting: clamp(Math.round(baseline + variance + (pos === 'A' ? 6 : 0))),
      passing: clamp(Math.round(baseline + randInt(rng, -8, 6))),
      speed: clamp(Math.round(baseline + randInt(rng, -7, 7))),
      defense: clamp(Math.round(baseline + randInt(rng, -9, 8) + (pos === 'D' || pos === 'LSM' ? 8 : 0))),
      IQ: clamp(Math.round(baseline + randInt(rng, -5, 7))),
      stamina: clamp(Math.round(baseline + randInt(rng, -6, 6))),
      discipline: clamp(Math.round(baseline + randInt(rng, -5, 7))),
      overall,
    });
  }

  // Fill to target size
  let fillIndex = 0;
  while (combined.length < TARGET_SIZE && fillIndex < POSITION_FILL_ORDER.length) {
    const pos = POSITION_FILL_ORDER[fillIndex];
    fillIndex++;
    const variance = randInt(rng, -12, 8);
    const overall = clamp(Math.round(baseline + variance - 8));
    const skill = clamp(Math.round(overall + randInt(rng, -3, 3)));
    combined.push({
      id: `${team.id}-fill-${pos}-${newSeed}-${combined.length}`,
      name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
      position: pos,
      year: 1,
      age: 18,
      skill,
      shooting: clamp(Math.round(baseline + variance + (pos === 'A' ? 6 : 0))),
      passing: clamp(Math.round(baseline + randInt(rng, -8, 6))),
      speed: clamp(Math.round(baseline + randInt(rng, -7, 7))),
      defense: clamp(Math.round(baseline + randInt(rng, -9, 8) + (pos === 'D' || pos === 'LSM' ? 8 : 0))),
      IQ: clamp(Math.round(baseline + randInt(rng, -5, 7))),
      stamina: clamp(Math.round(baseline + randInt(rng, -6, 6))),
      discipline: clamp(Math.round(baseline + randInt(rng, -5, 7))),
      overall,
    });
  }

  return combined.slice(0, TARGET_SIZE);
}

/** Summarize roster depth by position */
export interface RosterDepthSummary {
  position: Position;
  starters: number;
  backups: number;
  avgOverall: number;
}

export function getRosterDepthSummary(
  roster: Player[],
  starterIds: string[],
): RosterDepthSummary[] {
  const positions: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
  const starterSet = new Set(starterIds);

  return positions.map((pos) => {
    const posPlayers = roster.filter((p) => p.position === pos);
    const starters = posPlayers.filter((p) => starterSet.has(p.id)).length;
    const avgOverall =
      posPlayers.length > 0
        ? Math.round(posPlayers.reduce((s, p) => s + p.overall, 0) / posPlayers.length)
        : 0;
    return { position: pos, starters, backups: posPlayers.length - starters, avgOverall };
  });
}

/** Build the default starter list from a roster (top players by position) */
export function buildDefaultStarters(roster: Player[]): string[] {
  const starterCounts: Record<Position, number> = {
    A: 3,
    M: 3,
    D: 3,
    LSM: 1,
    FO: 1,
    G: 1,
  };

  const starters: string[] = [];
  for (const [pos, count] of Object.entries(starterCounts) as [Position, number][]) {
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, count);
    starters.push(...posPlayers.map((p) => p.id));
  }
  return starters;
}
