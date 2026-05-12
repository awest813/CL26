import type { Conference, Team } from '../types/sim';

const EXPECTED_CONFERENCE_COUNT = 16;
const EXPECTED_TEAMS_PER_CONFERENCE = 8;
const EXPECTED_TEAM_COUNT = EXPECTED_CONFERENCE_COUNT * EXPECTED_TEAMS_PER_CONFERENCE;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateLeagueData(conferences: Conference[], teams: Team[]): string[] {
  const errors: string[] = [];
  const conferenceIds = new Set<string>();
  const teamIds = new Set<string>();

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
    conferenceIds.add(conference.id);
  }

  for (const team of teams) {
    if (isBlank(team.id)) errors.push('Team id cannot be blank.');
    if (teamIds.has(team.id)) errors.push(`Duplicate team id: ${team.id}`);
    teamIds.add(team.id);

    if (isBlank(team.schoolName)) errors.push(`Team ${team.id || '(missing id)'} schoolName cannot be blank.`);
    if (isBlank(team.nickname)) errors.push(`Team ${team.id || '(missing id)'} nickname cannot be blank.`);
    if (isBlank(team.region)) errors.push(`Team ${team.id || '(missing id)'} region cannot be blank.`);
    if (!conferenceIds.has(team.conferenceId)) {
      errors.push(`Team ${team.id || '(missing id)'} references missing conference ${team.conferenceId}.`);
    }
    if (!Number.isFinite(team.prestige) || team.prestige < 1 || team.prestige > 100) {
      errors.push(`Team ${team.id || '(missing id)'} prestige must be between 1 and 100.`);
    }
  }

  for (const conference of conferences) {
    const teamCount = teams.filter((team) => team.conferenceId === conference.id).length;
    if (teamCount !== EXPECTED_TEAMS_PER_CONFERENCE) {
      errors.push(`Conference ${conference.id} expected ${EXPECTED_TEAMS_PER_CONFERENCE} teams, got ${teamCount}.`);
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
