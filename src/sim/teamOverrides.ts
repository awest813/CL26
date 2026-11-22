import type { Team } from '../types/sim';
import { TEAM_COLORS } from './teamMark.ts';

/**
 * A user's edits to a program's branding: name, nickname, logo letters, and logo colors.
 * Ids, conferences, regions, and prestige never change, so schedules, rosters, and every
 * seeded roll stay the same; only what the league is called and how it looks.
 */
export interface TeamOverride {
  schoolName?: string;
  nickname?: string;
  abbreviation?: string;
  colorIndex?: number;
}

export const SCHOOL_NAME_MAX = 36;
export const NICKNAME_MAX = 24;

/** Trimmed and normalized: blank fields drop out, letters go upper case. */
export function cleanTeamOverride(override: TeamOverride): TeamOverride {
  const clean: TeamOverride = {};
  const school = override.schoolName?.replace(/\s+/g, ' ').trim();
  const nickname = override.nickname?.replace(/\s+/g, ' ').trim();
  const letters = override.abbreviation?.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (school) clean.schoolName = school;
  if (nickname) clean.nickname = nickname;
  if (letters) clean.abbreviation = letters;
  if (override.colorIndex != null && Number.isInteger(override.colorIndex)) clean.colorIndex = override.colorIndex;
  return clean;
}

/** What is wrong with an edit, field by field. An empty object means it can be saved. */
export function validateTeamOverride(teamId: string, override: TeamOverride, teams: Team[]): Partial<Record<keyof TeamOverride, string>> {
  const errors: Partial<Record<keyof TeamOverride, string>> = {};
  const clean = cleanTeamOverride(override);
  if (override.schoolName != null && !clean.schoolName) errors.schoolName = 'A school needs a name.';
  if (clean.schoolName && clean.schoolName.length > SCHOOL_NAME_MAX) errors.schoolName = `Keep it to ${SCHOOL_NAME_MAX} characters.`;
  if (clean.schoolName && teams.some((team) => team.id !== teamId && team.schoolName.toLowerCase() === clean.schoolName!.toLowerCase())) {
    errors.schoolName = 'Another program already has that name.';
  }
  if (override.nickname != null && !clean.nickname) errors.nickname = 'A team needs a nickname.';
  if (clean.nickname && clean.nickname.length > NICKNAME_MAX) errors.nickname = `Keep it to ${NICKNAME_MAX} characters.`;
  if (override.abbreviation != null && override.abbreviation !== '' && (!clean.abbreviation || clean.abbreviation.length < 2 || clean.abbreviation.length > 4)) {
    errors.abbreviation = 'Use 2 to 4 letters.';
  }
  if (clean.colorIndex != null && (clean.colorIndex < 0 || clean.colorIndex >= TEAM_COLORS.length)) errors.colorIndex = 'Pick one of the colors.';
  return errors;
}

/** The league as the user has branded it: the bundled teams with each edit laid over. */
export function applyTeamOverrides(baseTeams: Team[], overrides: Record<string, TeamOverride> | undefined): Team[] {
  if (!overrides || Object.keys(overrides).length === 0) return baseTeams;
  return baseTeams.map((team) => {
    const override = overrides[team.id];
    if (!override) return team;
    const clean = cleanTeamOverride(override);
    return {
      ...team,
      ...(clean.schoolName ? { schoolName: clean.schoolName } : {}),
      ...(clean.nickname ? { nickname: clean.nickname } : {}),
      ...(clean.abbreviation ? { abbreviation: clean.abbreviation } : {}),
      ...(clean.colorIndex != null && clean.colorIndex >= 0 && clean.colorIndex < TEAM_COLORS.length ? { colorIndex: clean.colorIndex } : {}),
    };
  });
}
