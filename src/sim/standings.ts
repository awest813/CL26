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

/**
 * Each conference's leader by the conference table: its champion once the regular season is over.
 * Teams with no record yet count as 0-0.
 */
export function conferenceLeaders(
  teams: Array<{ id: string; schoolName: string; conferenceId: string }>,
  recordsByTeamId: Record<string, StandingRecord>,
): Record<string, string> {
  const empty: StandingRecord = { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 };
  const leaders: Record<string, { id: string; record: StandingRecord; name: string }> = {};
  for (const team of teams) {
    const row = { id: team.id, record: recordsByTeamId[team.id] ?? empty, name: team.schoolName };
    const current = leaders[team.conferenceId];
    if (!current || compareConferenceStanding(row, current) < 0) leaders[team.conferenceId] = row;
  }
  return Object.fromEntries(Object.entries(leaders).map(([conferenceId, row]) => [conferenceId, row.id]));
}
