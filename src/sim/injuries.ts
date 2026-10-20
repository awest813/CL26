import type { Player, Position } from '../types/sim';
import type { SeasonPhase } from './weeklyDesk';
import { makeRng, seedToNumber } from './rng';

export interface WeekScratch {
  playerId: string;
  name: string;
  position: Position;
}

const MIN_AVAILABLE: Record<Position, number> = {
  A: 3,
  M: 3,
  D: 3,
  LSM: 1,
  FO: 1,
  G: 1,
};

/**
 * This week's scratches for one roster. The seed is separate from the match
 * engine, so an empty list leaves the game RNG and the starter list untouched.
 */
export function weeklyScratches(
  roster: Player[],
  seasonSeed: number,
  weekKey: string,
  teamId: string,
): WeekScratch[] {
  if (roster.length === 0) return [];

  const rng = makeRng(seedToNumber(`${seasonSeed}:${weekKey}:${teamId}:injuries`));
  const roll = rng();
  const target = roll < 0.12 ? 2 : roll < 0.46 ? 1 : 0;
  if (target === 0) return [];

  const remainingAtPosition = new Map<Position, number>();
  for (const player of roster) {
    remainingAtPosition.set(player.position, (remainingAtPosition.get(player.position) ?? 0) + 1);
  }

  const pool = roster.filter(
    (player) => (remainingAtPosition.get(player.position) ?? 0) > MIN_AVAILABLE[player.position],
  );
  const scratches: WeekScratch[] = [];
  const available = [...pool];

  while (scratches.length < target && available.length > 0) {
    const index = Math.floor(rng() * available.length);
    const [player] = available.splice(index, 1);
    const left = (remainingAtPosition.get(player.position) ?? 0) - 1;
    if (left < MIN_AVAILABLE[player.position]) continue;
    remainingAtPosition.set(player.position, left);
    scratches.push({ playerId: player.id, name: player.name, position: player.position });
  }

  return scratches;
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
