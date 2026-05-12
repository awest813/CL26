import { describe, expect, test } from 'bun:test';
import { validateLeagueData } from './leagueDataValidation';
import type { Conference, Team } from '../types/sim';

function makeLeague(): { conferences: Conference[]; teams: Team[] } {
  const conferences = Array.from({ length: 16 }, (_, index) => ({
    id: `conf-${index + 1}`,
    name: `Conference ${index + 1}`,
  }));
  const teams = conferences.flatMap((conference, conferenceIndex) =>
    Array.from({ length: 8 }, (_, teamIndex) => ({
      id: `team-${conferenceIndex + 1}-${teamIndex + 1}`,
      schoolName: `School ${conferenceIndex + 1}-${teamIndex + 1}`,
      nickname: `Nick ${teamIndex + 1}`,
      conferenceId: conference.id,
      region: 'National',
      prestige: 50,
    })),
  );

  return { conferences, teams };
}

describe('validateLeagueData', () => {
  test('accepts a balanced 16x8 fictional league', () => {
    const { conferences, teams } = makeLeague();

    expect(validateLeagueData(conferences, teams)).toEqual([]);
  });

  test('reports unbalanced conferences and invalid team references', () => {
    const { conferences, teams } = makeLeague();
    teams[0] = { ...teams[0], conferenceId: 'missing-conf', prestige: 101 };

    const errors = validateLeagueData(conferences, teams);

    expect(errors.some((error) => error.includes('references missing conference missing-conf'))).toBe(true);
    expect(errors.some((error) => error.includes('prestige must be between 1 and 100'))).toBe(true);
    expect(errors.some((error) => error.includes('Conference conf-1 expected 8 teams, got 7'))).toBe(true);
  });
});
