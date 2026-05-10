/**
 * Seed string for procedurally generated non-user rosters.
 * Deterministic per (seasonSeed, teamId) so the same program has the same
 * players all season; a new seasonSeed (new year / new draw) refreshes the league.
 * PRE / seed 0 keeps the legacy static key used before a season exists.
 */
export function leagueSeasonRosterSeed(seasonSeed: number): string {
  if (seasonSeed === 0) return 'league-roster-v1';
  return `league-season-${seasonSeed}`;
}
