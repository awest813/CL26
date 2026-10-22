import type { Player, Position } from '../types/sim';
import type { SeasonPhase } from './weeklyDesk';
import { makeRng, seedToNumber } from './rng';

export interface WeekScratch {
  playerId: string;
  name: string;
  position: Position;
  /** What he is out with, e.g. "Ankle sprain". */
  injury: string;
  /** Games he will miss counting this one, or null when he is out for the season. */
  weeksLeft: number | null;
}

const MIN_AVAILABLE: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

/** The 12 regular-season weeks, the conference championships, then the four bracket rounds, as one timeline. */
const PLAYOFF_SLOTS: Record<string, number> = { CONF_SEMI: 12, CONF_FINAL: 13, ROUND1: 14, QUARTERFINAL: 15, SEMIFINAL: 16, FINAL: 17 };
const SEASON_SLOTS = 18;
/** Out for the rest of the year. */
const SEASON_ENDING = SEASON_SLOTS;

const INJURY_TYPES: Array<{ injury: string; weeks: [number, number]; weight: number }> = [
  { injury: 'Ankle sprain', weeks: [1, 1], weight: 30 },
  { injury: 'Hamstring strain', weeks: [1, 2], weight: 22 },
  { injury: 'Concussion protocol', weeks: [1, 2], weight: 12 },
  { injury: 'Shoulder separation', weeks: [2, 4], weight: 14 },
  { injury: 'Broken hand', weeks: [3, 5], weight: 10 },
  { injury: 'High ankle sprain', weeks: [4, 6], weight: 9 },
  { injury: 'Torn ACL', weeks: [SEASON_ENDING, SEASON_ENDING], weight: 3 },
];
const INJURY_WEIGHT_TOTAL = INJURY_TYPES.reduce((sum, type) => sum + type.weight, 0);

/** "back next week", "3 more weeks", or "out for the season". */
export function injuryTimeline(scratch: Pick<WeekScratch, 'weeksLeft'>): string {
  if (scratch.weeksLeft == null) return 'out for the season';
  if (scratch.weeksLeft <= 1) return 'back next week';
  return `out ${scratch.weeksLeft} weeks`;
}

/** Where a week key falls on the season timeline: `w0`…`w11`, then the playoff rounds. */
export function availabilitySlot(weekKey: string): number | null {
  if (weekKey in PLAYOFF_SLOTS) return PLAYOFF_SLOTS[weekKey];
  const match = /^w(\d+)$/.exec(weekKey);
  return match ? Number(match[1]) : null;
}

function slotKey(slot: number): string {
  return Object.entries(PLAYOFF_SLOTS).find(([, value]) => value === slot)?.[0] ?? `w${slot}`;
}

interface ActiveInjury {
  player: Player;
  injury: string;
  /** Last slot he misses (inclusive). */
  until: number;
  /** Out for the rest of the season, however early it happened. */
  seasonEnding: boolean;
}

/** New injuries on one slot of the timeline, never taking a position below a playable lineup. */
function rollNewInjuries(
  roster: Player[],
  seasonSeed: number,
  slot: number,
  teamId: string,
  active: Map<string, ActiveInjury>,
): void {
  const rng = makeRng(seedToNumber(`${seasonSeed}:${slotKey(slot)}:${teamId}:injuries`));
  const roll = rng();
  const target = roll < 0.08 ? 2 : roll < 0.38 ? 1 : 0;
  if (target === 0) return;

  const healthyAtPosition = new Map<Position, number>();
  for (const player of roster) {
    if (active.has(player.id)) continue;
    healthyAtPosition.set(player.position, (healthyAtPosition.get(player.position) ?? 0) + 1);
  }

  const available = roster.filter(
    (player) => !active.has(player.id) && (healthyAtPosition.get(player.position) ?? 0) > MIN_AVAILABLE[player.position],
  );
  let added = 0;
  while (added < target && available.length > 0) {
    const index = Math.floor(rng() * available.length);
    const [player] = available.splice(index, 1);
    const left = (healthyAtPosition.get(player.position) ?? 0) - 1;
    if (left < MIN_AVAILABLE[player.position]) continue;
    healthyAtPosition.set(player.position, left);

    let pick = rng() * INJURY_WEIGHT_TOTAL;
    const type = INJURY_TYPES.find((candidate) => (pick -= candidate.weight) <= 0) ?? INJURY_TYPES[0];
    const [low, high] = type.weeks;
    const weeks = low + Math.floor(rng() * (high - low + 1));
    active.set(player.id, { player, injury: type.injury, until: slot + weeks - 1, seasonEnding: low >= SEASON_ENDING });
    added += 1;
  }
}

/**
 * Who is out this week, and for how long. Stateless: an injury from an earlier week
 * is found again by replaying the season so far, so the same roster and week always
 * give the same answer. The seed is separate from the match engine, so an empty list
 * leaves the game RNG and the starter list untouched.
 */
export function weeklyScratches(
  roster: Player[],
  seasonSeed: number,
  weekKey: string,
  teamId: string,
): WeekScratch[] {
  if (roster.length === 0) return [];
  const slot = availabilitySlot(weekKey);
  if (slot == null) return [];

  const active = new Map<string, ActiveInjury>();
  for (let current = 0; current <= slot; current += 1) {
    for (const [id, injury] of active) {
      if (injury.until < current) active.delete(id);
    }
    rollNewInjuries(roster, seasonSeed, current, teamId, active);
  }

  return [...active.values()].map(({ player, injury, until, seasonEnding }) => ({
    playerId: player.id,
    name: player.name,
    position: player.position,
    injury,
    weeksLeft: seasonEnding || until >= SEASON_ENDING ? null : until - slot + 1,
  }));
}

export function availabilityWeekKey(
  phase: SeasonPhase,
  weekIndex: number,
  playoffRound: string | null,
): string | null {
  if (phase === 'REGULAR') return `w${weekIndex}`;
  if (phase === 'PLAYOFF' && playoffRound) return playoffRound;
  return null;
}

/**
 * Drop scratched players for this week's sim and promote the next player at
 * that position. An empty scratch list returns the same roster and starters.
 */
export function rosterForAvailability(
  roster: Player[],
  starterIds: string[],
  scratches: WeekScratch[],
): { roster: Player[]; starterIds: string[] } {
  if (scratches.length === 0) return { roster, starterIds };

  const out = new Set(scratches.map((scratch) => scratch.playerId));
  const availableRoster = roster.filter((player) => !out.has(player.id));
  const kept = starterIds.filter((id) => availableRoster.some((player) => player.id === id));
  const starterSet = new Set(kept);
  const counts: Record<Position, number> = { A: 0, M: 0, D: 0, LSM: 0, FO: 0, G: 0 };
  for (const player of availableRoster) {
    if (starterSet.has(player.id)) counts[player.position] += 1;
  }

  const filled = [...kept];
  for (const position of Object.keys(MIN_AVAILABLE) as Position[]) {
    const need = MIN_AVAILABLE[position] - counts[position];
    if (need <= 0) continue;
    const backups = availableRoster
      .filter((player) => player.position === position && !starterSet.has(player.id))
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
    for (const player of backups.slice(0, need)) {
      filled.push(player.id);
      starterSet.add(player.id);
    }
  }

  return { roster: availableRoster, starterIds: filled };
}
