export interface StandingRecord {
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  pointsFor: number;
  pointsAgainst: number;
}

function pointDiff(record: StandingRecord): number {
  return record.pointsFor - record.pointsAgainst;
}

/** Conference table: wins, then losses, point differential, overall wins, then name. */
export function compareConferenceStanding(
  a: { record: StandingRecord; name: string },
  b: { record: StandingRecord; name: string },
): number {
  if (b.record.confWins !== a.record.confWins) return b.record.confWins - a.record.confWins;
  if (a.record.confLosses !== b.record.confLosses) return a.record.confLosses - b.record.confLosses;
  const diff = pointDiff(b.record) - pointDiff(a.record);
  if (diff !== 0) return diff;
  if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
  if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
  return a.name.localeCompare(b.name);
}

/** Overall table: wins, losses, point differential, then name. */
export function compareOverallStanding(
  a: { record: StandingRecord; name: string },
  b: { record: StandingRecord; name: string },
): number {
  if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
  if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
  const diff = pointDiff(b.record) - pointDiff(a.record);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
}
