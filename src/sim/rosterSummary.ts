import type { Player, Position } from '../types/sim.ts';
import { POSITION_ORDER } from '../types/sim.ts';

const YEAR_LABELS = {
  1: 'Fr',
  2: 'So',
  3: 'Jr',
  4: 'Sr',
} as const;

export function playerYearLabel(year: number, redshirtUsed = false): string {
  const label = YEAR_LABELS[year as keyof typeof YEAR_LABELS] ?? `Yr${year}`;
  return redshirtUsed ? `RS ${label}` : label;
}

const SENIOR_EXPERIENCE_WEIGHT = 100;
const UNDERCLASS_EXPERIENCE_WEIGHT = 35;

function rosterAverage(values: number[]): number {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function averageThreeAttributes(first: number, second: number, third: number): number {
  return (first + second + third) / 3;
}

function averageTwoAttributes(first: number, second: number): number {
  return (first + second) / 2;
}

export interface RosterSummary {
  rosterSize: number;
  rosterOverall: number;
  topPlayers: Player[];
  positionSummary: Array<{ position: Position; count: number; avgOverall: number }>;
  classSummary: Array<{ year: 1 | 2 | 3 | 4; label: string; count: number }>;
  unitStrengths: {
    offense: number;
    defense: number;
    faceoff: number;
    goalie: number;
    experience: number;
  };
}

/** Depth, class balance, and unit ratings for a concrete roster. */
export function buildRosterSummary(roster: Player[]): RosterSummary {
  const overall = rosterAverage(roster.map((player) => player.overall));
  const topPlayers = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const positionSummary = POSITION_ORDER.map((position) => {
    const players = roster.filter((player) => player.position === position);
    return {
      position,
      count: players.length,
      avgOverall: rosterAverage(players.map((player) => player.overall)),
    };
  });
  const classSummary = ([1, 2, 3, 4] as const).map((year) => ({
    year,
    label: YEAR_LABELS[year],
    count: roster.filter((player) => player.year === year).length,
  }));
  const attackers = roster.filter((player) => player.position === 'A' || player.position === 'M');
  const defenders = roster.filter((player) => player.position === 'D' || player.position === 'LSM');
  const faceoff = roster.filter((player) => player.position === 'FO');
  const goalies = roster.filter((player) => player.position === 'G');
  const seniors = roster.filter((player) => player.year === 4).length;
  const underclassmen = roster.filter((player) => player.year <= 2).length;

  return {
    rosterSize: roster.length,
    rosterOverall: overall,
    topPlayers,
    positionSummary,
    classSummary,
    unitStrengths: {
      offense: rosterAverage(attackers.map((player) => averageThreeAttributes(player.shooting, player.passing, player.IQ))),
      defense: rosterAverage(defenders.map((player) => averageThreeAttributes(player.defense, player.speed, player.IQ))),
      faceoff: rosterAverage(faceoff.map((player) => player.overall)),
      goalie: rosterAverage(goalies.map((player) => averageTwoAttributes(player.defense, player.IQ))),
      experience: roster.length > 0
        ? Math.round((seniors * SENIOR_EXPERIENCE_WEIGHT + underclassmen * UNDERCLASS_EXPERIENCE_WEIGHT) / roster.length)
        : 0,
    },
  };
}
