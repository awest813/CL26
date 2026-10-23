import { Player, Position, SignedRecruit, Team } from '../types/sim';
import { makeRng, pickOne, randInt, seedToNumber } from './rng';
import namesData from '../data/names.json' with { type: 'json' };
import { faceoffRating, growSpecialty, playerPotential, rollPotential, rollSpecialties, savingRating } from './playerSpecialty';
import { ROSTER_POSITION_ORDER, ROSTER_POSITION_TARGETS, ROSTER_SIZE } from './generateRoster';
import { advanceClassYear } from './redshirts';

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
/** Points of room under his potential at which a player grows at the full rate for his class. */
const POTENTIAL_ROOM_FOR_FULL_GROWTH = 8;
const POTENTIAL_SCALE_MAX = 1.25;
const clampPotential = (value: number) => Math.max(40, Math.min(99, Math.round(value)));

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
  // The recruit keeps the name he signed under. The name is still drawn so the rest of the roll is unchanged.
  const drawnName = `${pickOne(rng, namesData.firstNames)} ${pickOne(rng, namesData.lastNames)}`;

  return {
    id: `${team.id}-recruit-${signedRecruit.recruitId}-yr1`,
    name: signedRecruit.name ?? drawnName,
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
    ...rollSpecialties(position, baseline, makeRng(seedToNumber(`${team.id}:${signedRecruit.recruitId}:specialty`))),
    // The scouting ceiling, read as the overall he can reach by his senior year.
    potential: clampPotential(Math.max(overall + 2, 40 + ((signedRecruit.potential ?? 52 + signedRecruit.stars * 9) - 40) * 0.85)),
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
    // Freshmen and sophomores develop more, and a player near his ceiling hardly at all.
    const growthCeiling =
      (player.year === 1 ? 4 : player.year === 2 ? 3 : player.year === 3 ? 2 : 1) + totalBonus;
    const roomToPotential = playerPotential(player) - player.overall;
    const potentialScale = Math.max(0, Math.min(POTENTIAL_SCALE_MAX, roomToPotential / POTENTIAL_ROOM_FOR_FULL_GROWTH));
    const growth = randInt(rng, 0, Math.min(6, Math.round(growthCeiling * potentialScale)));
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

    // Only a specialist works on his specialty; it grows like the other traits.
    const faceoff = player.position === 'FO' ? growSpecialty(faceoffRating(player), growth, rng) : faceoffRating(player);
    const saving = player.position === 'G' ? growSpecialty(savingRating(player), growth, rng) : savingRating(player);

    return { ...player, shooting, passing, speed, defense, IQ, stamina, discipline, overall, skill, faceoff, saving };
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

/** The traits a week of each install grows on the roster. */
export const INSTALL_GROWTH_TRAITS: Record<PracticeFocus, PlayerTrait[]> = {
  OFFENSE: ['shooting', 'passing', 'IQ'],
  DEFENSE: ['defense', 'discipline', 'IQ'],
  CONDITIONING: ['speed', 'stamina'],
  DISCIPLINE: ['discipline', 'IQ', 'stamina'],
};

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

  const chosenTraits = INSTALL_GROWTH_TRAITS[practiceFocus];

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

const POSITION_FILL_ORDER: Position[] = ROSTER_POSITION_ORDER;
const ROSTER_TARGET_SIZE = ROSTER_SIZE;
/** Two deep behind every starting spot. */
const POSITION_MINIMUMS: Record<Position, number> = {
  A: 6,
  M: 6,
  D: 6,
  LSM: 2,
  FO: 2,
  G: 2,
};

/**
 * Apply full roster turnover for the offseason:
 * 1. Develop returning players
 * 2. Remove seniors (year === 4) and apply transfer/attrition
 * 3. Age returning players (year++)
 * 4. Add incoming signed recruits as freshmen
 * 5. Fill any remaining open spots with generated walk-ons
 */
export interface RosterDeparture {
  player: Player;
  reason: 'graduate' | 'transfer';
}

function transferChanceForYear(year: Player['year']): number {
  if (year === 1) return 0.08;
  if (year === 2) return 0.06;
  if (year === 3) return 0.04;
  return 0;
}

function splitDepartures(developed: Player[], rng: () => number): { returners: Player[]; departures: RosterDeparture[] } {
  const returners: Player[] = [];
  const departures: RosterDeparture[] = [];
  for (const player of developed) {
    if (player.year === 4) {
      departures.push({ player, reason: 'graduate' });
      continue;
    }
    if (rng() < transferChanceForYear(player.year)) {
      departures.push({ player, reason: 'transfer' });
      continue;
    }
    returners.push(player);
  }
  return { returners, departures };
}

/** Who leaves before the next season. Same rolls as roster turnover. */
export function previewOffseasonDepartures(
  currentRoster: Player[],
  team: Team,
  newSeed: number,
  options?: CoachDevelopmentInputs,
): RosterDeparture[] {
  const rng = makeRng(seedToNumber(`${newSeed}:${team.id}:turnover`));
  const developed = developPlayers(currentRoster, rng, options);
  return splitDepartures(developed, rng).departures;
}

export function applyRosterTurnover(
  currentRoster: Player[],
  signedRecruits: SignedRecruit[],
  team: Team,
  newSeed: number,
  options?: CoachDevelopmentInputs,
  additions: Player[] = [],
  earlyProIds: readonly string[] = [],
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

  // Step 2: Seniors graduate. Underclassmen can enter the portal.
  // A drafted junior turns pro after those rolls, so an empty list does not change the stream.
  const { returners } = splitDepartures(developed, rng);
  const turningPro = new Set(earlyProIds);
  const staying = returners.filter((player) => !turningPro.has(player.id));

  // Step 3: Age returning players. A redshirt keeps his class year.
  const agedReturners: Player[] = staying.map(advanceClassYear);

  // Step 4: Convert signed recruits to freshmen
  const incomingFreshmen: Player[] = signedRecruits.map((sr) =>
    convertRecruitToPlayer(sr, team, rng),
  );

  // Step 5: Fill remaining spots with generated walk-ons up to 24 players.
  // A large signing class can already be over the target. Make room before adding
  // a missing position, or slice() drops the only new goalie.
  const combined = [...agedReturners, ...incomingFreshmen, ...additions];
  const requiredPositions: Position[] = ['A', 'M', 'D', 'LSM', 'FO', 'G'];
  const missingPositions = requiredPositions.filter((pos) => !combined.some((player) => player.position === pos));
  // Over the limit, the staff cuts returning depth before anyone it just signed or claimed.
  const newcomers = new Set([...incomingFreshmen, ...additions].map((player) => player.id));
  trimRosterForRequiredAdds(combined, ROSTER_TARGET_SIZE, missingPositions.length, newcomers);

  const baseline = 45 + team.prestige * 0.4;
  let walkOnSerial = 0;
  const addWalkOn = (pos: Position, tag: string, overallPenalty: number) => {
    walkOnSerial += 1;
    const variance = randInt(rng, -12, 8);
    const overall = clamp(Math.round(baseline + variance - overallPenalty));
    const skill = clamp(Math.round(overall + randInt(rng, -3, 3)));
    const walkOnRng = makeRng(seedToNumber(`${team.id}:${tag}:${newSeed}:${walkOnSerial}:specialty`));
    combined.push({
      id: `${team.id}-${tag}-${pos}-${newSeed}-${walkOnSerial}`,
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
      ...rollSpecialties(pos, baseline - overallPenalty, walkOnRng),
      potential: rollPotential(overall, 1, walkOnRng),
    });
  };

  for (const pos of missingPositions) addWalkOn(pos, 'walkon', 5);

  // Walk-ons fill where the roster is thinnest against its position targets.
  while (combined.length < ROSTER_TARGET_SIZE) {
    const counts = positionCounts(combined);
    const pos = POSITION_FILL_ORDER.reduce((best, candidate) => {
      const need = ROSTER_POSITION_TARGETS[candidate] - (counts.get(candidate) ?? 0);
      const bestNeed = ROSTER_POSITION_TARGETS[best] - (counts.get(best) ?? 0);
      return need > bestNeed ? candidate : best;
    }, POSITION_FILL_ORDER[0]);
    addWalkOn(pos, 'fill', 8);
  }

  // A full class can still leave one position short of a starting unit. Swap surplus depth.
  for (const [pos, minimum] of Object.entries(POSITION_MINIMUMS) as [Position, number][]) {
    while (combined.filter((player) => player.position === pos).length < minimum) {
      if (combined.length < ROSTER_TARGET_SIZE) {
        addWalkOn(pos, 'walkon', 5);
        continue;
      }
      const donor = lowestSurplusIndex(combined, newcomers);
      if (donor < 0) break;
      combined.splice(donor, 1);
      addWalkOn(pos, 'walkon', 5);
    }
  }

  trimRosterForRequiredAdds(combined, ROSTER_TARGET_SIZE, 0, newcomers);
  return combined;
}

function positionCounts(roster: Player[]): Map<Position, number> {
  const counts = new Map<Position, number>();
  for (const player of roster) counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
  return counts;
}

/**
 * Lowest-rated player at a position that is above its starting minimum. Players in
 * `protectedIds` (new signees and transfers) go only once no returner can.
 */
function lowestSurplusIndex(roster: Player[], protectedIds: Set<string> = new Set()): number {
  const counts = positionCounts(roster);
  const surplus = (player: Player) => (counts.get(player.position) ?? 0) > POSITION_MINIMUMS[player.position];
  const anyReturner = roster.some((player) => surplus(player) && !protectedIds.has(player.id));
  let removal = -1;
  let lowestOverall = Infinity;
  for (let index = 0; index < roster.length; index += 1) {
    const player = roster[index];
    if (!surplus(player)) continue;
    if (anyReturner && protectedIds.has(player.id)) continue;
    if (player.overall < lowestOverall) {
      removal = index;
      lowestOverall = player.overall;
    }
  }
  return removal;
}

/**
 * Drop the lowest-rated depth player at the deepest position until `incomingRequired`
 * new spots fit. Players in `protectedIds` (new signees and transfers) go only once no
 * returner can.
 */
function trimRosterForRequiredAdds(roster: Player[], target: number, incomingRequired: number, protectedIds: Set<string> = new Set()) {
  const required = new Set<Position>(['A', 'M', 'D', 'LSM', 'FO', 'G']);
  while (roster.length + incomingRequired > target && roster.length > 0) {
    const counts = positionCounts(roster);
    const anyReturnerCuttable = roster.some((player) =>
      !protectedIds.has(player.id) && (counts.get(player.position) ?? 0) > POSITION_MINIMUMS[player.position]);

    let removal = -1;
    let deepest = 1;
    let lowestOverall = Infinity;
    for (let index = 0; index < roster.length; index += 1) {
      const player = roster[index];
      if (anyReturnerCuttable && protectedIds.has(player.id)) continue;
      const count = counts.get(player.position) ?? 0;
      if (count <= POSITION_MINIMUMS[player.position]) continue;
      if (required.has(player.position) && count <= 1) continue;
      if (count > deepest || (count === deepest && player.overall < lowestOverall)) {
        removal = index;
        deepest = count;
        lowestOverall = player.overall;
      }
    }
    if (removal < 0) break;
    roster.splice(removal, 1);
  }
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
    // A faceoff man and a goalie start on their specialty; everyone else on overall.
    const startingRating = (p: Player) =>
      pos === 'FO' ? faceoffRating(p) : pos === 'G' ? savingRating(p) : p.overall;
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => startingRating(b) - startingRating(a) || b.overall - a.overall)
      .slice(0, count);
    starters.push(...posPlayers.map((p) => p.id));
  }
  return starters;
}
