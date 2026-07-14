import type { Conference, Team } from '../types/sim';

const EXPECTED_CONFERENCE_COUNT = 16;
const EXPECTED_TEAMS_PER_CONFERENCE = 8;
const EXPECTED_TEAM_COUNT = EXPECTED_CONFERENCE_COUNT * EXPECTED_TEAMS_PER_CONFERENCE;
const MAX_CONFERENCE_PRESTIGE_SPREAD = 34;

/** Canonical regions used by both league JSON and recruiting. */
export const LEAGUE_REGIONS = [
  'Northeast',
  'Mid-Atlantic',
  'Southeast',
  'South',
  'Midwest',
  'Southwest',
  'West',
  'North',
] as const;

export type LeagueRegion = (typeof LEAGUE_REGIONS)[number];

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateLeagueData(conferences: Conference[], teams: Team[]): string[] {
  const errors: string[] = [];
  const conferenceIds = new Set<string>();
  const conferenceNames = new Set<string>();
  const teamIds = new Set<string>();
  const schoolNames = new Set<string>();
  const nicknames = new Set<string>();
  const allowedRegions = new Set<string>(LEAGUE_REGIONS);

  if (conferences.length !== EXPECTED_CONFERENCE_COUNT) {
    errors.push(`Expected ${EXPECTED_CONFERENCE_COUNT} conferences, got ${conferences.length}.`);
  }

  if (teams.length !== EXPECTED_TEAM_COUNT) {
    errors.push(`Expected ${EXPECTED_TEAM_COUNT} teams, got ${teams.length}.`);
  }

  for (const conference of conferences) {
    if (isBlank(conference.id)) errors.push('Conference id cannot be blank.');
    if (isBlank(conference.name)) errors.push(`Conference ${conference.id || '(missing id)'} name cannot be blank.`);
    if (conferenceIds.has(conference.id)) errors.push(`Duplicate conference id: ${conference.id}`);
    if (!isBlank(conference.name) && conferenceNames.has(conference.name)) {
      errors.push(`Duplicate conference name: ${conference.name}`);
    }
    if (!isBlank(conference.id)) conferenceIds.add(conference.id);
    if (!isBlank(conference.name)) conferenceNames.add(conference.name);
  }

  for (const team of teams) {
    if (isBlank(team.id)) errors.push('Team id cannot be blank.');
    if (!isBlank(team.id) && teamIds.has(team.id)) errors.push(`Duplicate team id: ${team.id}`);

    if (isBlank(team.schoolName)) errors.push(`Team ${team.id || '(missing id)'} schoolName cannot be blank.`);
    if (isBlank(team.nickname)) errors.push(`Team ${team.id || '(missing id)'} nickname cannot be blank.`);
    if (isBlank(team.region)) errors.push(`Team ${team.id || '(missing id)'} region cannot be blank.`);
    if (!conferenceIds.has(team.conferenceId)) {
      errors.push(`Team ${team.id || '(missing id)'} references missing conference ${team.conferenceId}.`);
    }
    if (!Number.isFinite(team.prestige) || team.prestige < 1 || team.prestige > 100) {
      errors.push(`Team ${team.id || '(missing id)'} prestige must be between 1 and 100.`);
    }
    if (!isBlank(team.region) && !allowedRegions.has(team.region)) {
      errors.push(`Team ${team.id || '(missing id)'} has unknown region "${team.region}".`);
    }
    if (!isBlank(team.schoolName) && schoolNames.has(team.schoolName)) {
      errors.push(`Duplicate schoolName: ${team.schoolName}`);
    }
    if (!isBlank(team.nickname) && nicknames.has(team.nickname)) {
      errors.push(`Duplicate nickname: ${team.nickname}`);
    }
    if (!isBlank(team.id)) teamIds.add(team.id);
    if (!isBlank(team.schoolName)) schoolNames.add(team.schoolName);
    if (!isBlank(team.nickname)) nicknames.add(team.nickname);
  }

  for (const conference of conferences) {
    const confTeams = teams.filter((team) => team.conferenceId === conference.id);
    if (confTeams.length !== EXPECTED_TEAMS_PER_CONFERENCE) {
      errors.push(`Conference ${conference.id} expected ${EXPECTED_TEAMS_PER_CONFERENCE} teams, got ${confTeams.length}.`);
    }
    if (confTeams.length > 0) {
      const prestiges = confTeams.map((team) => team.prestige);
      const spread = Math.max(...prestiges) - Math.min(...prestiges);
      if (spread > MAX_CONFERENCE_PRESTIGE_SPREAD) {
        errors.push(
          `Conference ${conference.id} prestige spread ${spread} exceeds max ${MAX_CONFERENCE_PRESTIGE_SPREAD}.`,
        );
      }
    }
  }

  return errors;
}

export function assertValidLeagueData(conferences: Conference[], teams: Team[]): void {
  const errors = validateLeagueData(conferences, teams);
  if (errors.length > 0) {
    throw new Error(`Invalid league data:\n${errors.join('\n')}`);
  }
}
