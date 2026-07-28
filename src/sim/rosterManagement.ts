import { Player, Position, SignedRecruit, Team } from '../types/sim';
import { compareStringsAsc } from './ordering';
import { makeRng, pickOne, randInt, seedToNumber } from './rng';
import namesData from '../data/names.json' with { type: 'json' };

const clamp = (value: number) => Math.max(40, Math.min(99, value));
const FACILITIES_BONUS_DIVISOR = 22;
const OPERATIONS_BONUS_DIVISOR = 2;
const BOOSTERS_GROWTH_THRESHOLD = 75;
const TRAIT_BUMP_PROBABILITY = 0.62;
/** Attributes above this grow slowly; above HARD_CAP they stop. */
const DEVELOPMENT_SOFT_CAP = 86;
const DEVELOPMENT_HARD_CAP = 92;
const WEEKLY_GROWTH_SOFT_OVERALL = 86;
const WEEKLY_GROWTH_HARD_OVERALL = 92;

type CoachArchetype = 'RECRUITER' | 'TACTICIAN' | 'DEVELOPER';
type PracticeFocus = 'OFFENSE' | 'DEFENSE' | 'CONDITIONING' | 'DISCIPLINE';
type PlayerTrait = keyof Pick<Player, 'shooting' | 'passing' | 'speed' | 'defense' | 'IQ' | 'stamina' | 'discipline'>;

export interface CoachDevelopmentInputs {
  coachArchetype?: CoachArchetype;
  developmentSkill?: number;
  operationsSkill?: number;
  facilitiesLevel?: number;
  boostersLevel?: number;
}

/** Convert star rating to an approximate overall baseline */
function starsToBaseline(stars: number): number {
  // 2★ ~53, 3★ ~61, 4★ ~69, 5★ ~77 — elite signees are good, not finished products
  return 37 + stars * 8;
}

function potentialBaselineBonus(potential: number | undefined, stars: number): number {
  const p = potential ?? 52 + stars * 9;
  const clamped = Math.max(40, Math.min(99, p));
  return (clamped - 72) * 0.18;
}

function growthRoom(attribute: number): number {
  if (attribute >= DEVELOPMENT_HARD_CAP) return 0;
  if (attribute >= DEVELOPMENT_SOFT_CAP) return 1;
  return DEVELOPMENT_HARD_CAP - attribute;
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
  const operationsSkillBonus = Math.floor((options?.operationsSkill ?? 0) / OPERATIONS_BONUS_DIVISOR);
  const boostersModifier = options?.boostersLevel != null && options.boostersLevel >= BOOSTERS_GROWTH_THRESHOLD ? 1 : 0;
  const totalBonus = devBonus + developmentSkillBonus + facilitiesBonus + operationsSkillBonus + boostersModifier;

  return roster.map((player) => {
    // Freshmen and sophomores develop more
    const growthCeiling =
      (player.year === 1 ? 4 : player.year === 2 ? 3 : player.year === 3 ? 2 : 1) + totalBonus;
    const growth = randInt(rng, 0, Math.min(6, growthCeiling));
    if (growth === 0) return player;

    const bump = (base: number) => {
      const room = growthRoom(base);
      if (room <= 0) return base;
      return clamp(base + randInt(rng, 0, Math.min(growth, room)));
    };
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

function applyTargetedTraitGrowth(player: Player, rng: () => number, targets: PlayerTrait[]): Player {
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
    if (growthRoom(updates[key]) <= 0) continue;
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
      6,
      2 +
        Math.floor((options?.developmentSkill ?? 0) / 2) +
        Math.floor((coachSkill - 60) / 15) +
        Math.floor((options?.facilitiesLevel ?? 50) / 28),
    ),
  );

  const focusTraits: Record<PracticeFocus, PlayerTrait[]> = {
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
    if (player.overall >= WEEKLY_GROWTH_HARD_OVERALL) continue;
    if (player.overall >= WEEKLY_GROWTH_SOFT_OVERALL && rng() > 0.35) continue;
    mutable[playerIndex] = applyTargetedTraitGrowth(player, rng, chosenTraits);
  }

  return mutable;
}

const POSITION_FILL_ORDER: Position[] = ['A', 'A', 'A', 'M', 'M', 'M', 'M', 'D', 'D', 'D', 'LSM', 'FO', 'G', 'A', 'M', 'D', 'M', 'D', 'A', 'M', 'D', 'LSM', 'M', 'D', 'A'];

/** Roster target — matches the 25-slot shape produced by `generateRoster`. */
export const ROSTER_TARGET_SIZE = 25;

const REQUIRED_POSITIONS: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];

/** Bodies a trim pass must leave at each position so a lineup can still be fielded. */
const POSITION_MINIMUMS: Record<Position, number> = { A: 3, M: 3, D: 3, LSM: 1, FO: 1, G: 1 };

function countByPosition(players: Player[]): Record<Position, number> {
  const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  players.forEach((player) => {
    counts[player.position] += 1;
  });
  return counts;
}

/**
 * Trim an over-full roster down to `targetSize`.
 *
 * Scholarship signees are never cut: the class is the payoff for a full season of
 * recruiting, so returning depth makes room instead. Cuts take the weakest eligible
 * player whose position still clears its minimum. If protections leave no legal cut,
 * the roster stays slightly over target rather than voiding a signed player.
 */
export function trimRosterToTarget(
  roster: Player[],
  protectedIds: Set<string>,
  targetSize: number = ROSTER_TARGET_SIZE,
): Player[] {
  if (roster.length <= targetSize) return roster;

  const counts = countByPosition(roster);
  const cutOrder = roster
    .filter((player) => !protectedIds.has(player.id))
    .sort((a, b) => a.overall - b.overall || compareStringsAsc(a.id, b.id));

  const cutIds = new Set<string>();
  for (const candidate of cutOrder) {
    if (roster.length - cutIds.size <= targetSize) break;
    if (counts[candidate.position] <= POSITION_MINIMUMS[candidate.position]) continue;
    counts[candidate.position] -= 1;
    cutIds.add(candidate.id);
  }

  return roster.filter((player) => !cutIds.has(player.id));
}

interface DepthPlayerTuning {
  varianceMin: number;
  varianceMax: number;
  overallPenalty: number;
}

/** Emergency body added to cover a position no one on the roster plays. */
const WALK_ON_TUNING: DepthPlayerTuning = { varianceMin: -10, varianceMax: 8, overallPenalty: 5 };
/** Back-of-the-roster filler used to reach the roster target. */
const ROSTER_FILL_TUNING: DepthPlayerTuning = { varianceMin: -12, varianceMax: 8, overallPenalty: 8 };

/** Build a depth-chart body (walk-on / roster filler) for an open spot. */
function makeDepthPlayer(
  rng: () => number,
  baseline: number,
  position: Position,
  id: string,
  tuning: DepthPlayerTuning,
): Player {
  const variance = randInt(rng, tuning.varianceMin, tuning.varianceMax);
  const overall = clamp(Math.round(baseline + variance - tuning.overallPenalty));
  const skill = clamp(Math.round(overall + randInt(rng, -3, 3)));

  return {
    id,
    name: `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`,
    position,
    year: 1,
    age: 18,
    skill,
    shooting: clamp(Math.round(baseline + variance + (position === 'A' ? 6 : 0))),
    passing: clamp(Math.round(baseline + randInt(rng, -8, 6))),
    speed: clamp(Math.round(baseline + randInt(rng, -7, 7))),
    defense: clamp(Math.round(baseline + randInt(rng, -9, 8) + (position === 'D' || position === 'LSM' ? 8 : 0))),
    IQ: clamp(Math.round(baseline + randInt(rng, -5, 7))),
    stamina: clamp(Math.round(baseline + randInt(rng, -6, 6))),
    discipline: clamp(Math.round(baseline + randInt(rng, -5, 7))),
    overall,
  };
}

/**
 * Apply full roster turnover for the offseason:
 * 1. Develop returning players
 * 2. Remove seniors (year === 4) and apply transfer/attrition
 * 3. Age returning players (year++)
 * 4. Add incoming signed recruits as freshmen
 * 5. Reserve spots for positions left below their lineup minimum
 * 6. Trim surplus depth (never a signee) back to the roster target
 * 7. Fill open spots with generated walk-ons
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

  const baseline = 45 + team.prestige * 0.4;
  const withRecruits = [...agedReturners, ...incomingFreshmen];

  // Step 5: Work out which positions graduation left short of a fieldable lineup.
  // These walk-ons are mandatory, so reserve their spots before trimming.
  const counts = countByPosition(withRecruits);
  const shortfalls: Position[] = [];
  for (const pos of REQUIRED_POSITIONS) {
    for (let i = counts[pos]; i < POSITION_MINIMUMS[pos]; i += 1) {
      shortfalls.push(pos);
    }
  }

  // Step 6: Trim surplus depth back to the roster target.
  // Signees are protected — a class that outgrows the roster pushes out weak
  // returners rather than being silently dropped on the floor.
  const signedPlayerIds = new Set(incomingFreshmen.map((player) => player.id));
  const combined = trimRosterToTarget(
    withRecruits,
    signedPlayerIds,
    Math.max(0, ROSTER_TARGET_SIZE - shortfalls.length),
  );

  // Step 7: Cover the shortfalls, then fill the rest of the depth chart (walk-ons are below average)
  for (const pos of shortfalls) {
    combined.push(
      makeDepthPlayer(rng, baseline, pos, `${team.id}-walkon-${pos}-${newSeed}-${combined.length}`, WALK_ON_TUNING),
    );
  }

  // Fill to target size
  let fillIndex = 0;
  while (combined.length < ROSTER_TARGET_SIZE && fillIndex < POSITION_FILL_ORDER.length) {
    const pos = POSITION_FILL_ORDER[fillIndex];
    fillIndex++;
    combined.push(
      makeDepthPlayer(rng, baseline, pos, `${team.id}-fill-${pos}-${newSeed}-${combined.length}`, ROSTER_FILL_TUNING),
    );
  }

  return combined;
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

/** Starting slots available at each position. Single source of truth for depth charts. */
export const STARTER_SLOTS_BY_POSITION: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

/** Build the default starter list from a roster (top players by position) */
export function buildDefaultStarters(roster: Player[]): string[] {
  const starters: string[] = [];
  for (const [pos, count] of Object.entries(STARTER_SLOTS_BY_POSITION) as [Position, number][]) {
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, count);
    starters.push(...posPlayers.map((p) => p.id));
  }
  return starters;
}
