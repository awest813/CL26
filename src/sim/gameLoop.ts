import type { PlayoffGame, PlayoffRoundName, PlayoffState } from '../types/sim.ts';
import type { SeasonPhase } from './weeklyDesk.ts';

export const PLAYOFF_ROUND_LABELS: Record<PlayoffRoundName, string> = {
  ROUND1: 'First round',
  QUARTERFINAL: 'Quarterfinals',
  SEMIFINAL: 'Semifinals',
  FINAL: 'Championship',
};

const ROUND_ORDER: PlayoffRoundName[] = ['ROUND1', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'];

export interface UserPlayoffSpot {
  seed: number | null;
  currentGame: PlayoffGame | null;
  lastGame: PlayoffGame | null;
  bye: boolean;
  eliminated: boolean;
}

function involves(game: PlayoffGame, teamId: string): boolean {
  return game.homeTeamId === teamId || game.awayTeamId === teamId;
}

export function userPlayoffSpot(playoffs: PlayoffState | null, teamId: string | null): UserPlayoffSpot {
  if (!playoffs || !teamId) {
    return { seed: null, currentGame: null, lastGame: null, bye: false, eliminated: false };
  }

  const seed = playoffs.seeds.find((row) => row.teamId === teamId)?.seed ?? null;
  const inCurrent = playoffs.rounds[playoffs.currentRound].find((game) => involves(game, teamId)) ?? null;
  const currentGame = inCurrent && inCurrent.winnerTeamId == null ? inCurrent : null;

  let lastGame: PlayoffGame | null = null;
  for (const round of ROUND_ORDER) {
    const played = playoffs.rounds[round].find((game) => involves(game, teamId) && game.result != null);
    if (played) lastGame = played;
  }

  const bye = seed != null
    && seed <= 4
    && playoffs.currentRound === 'ROUND1'
    && currentGame == null
    && playoffs.championTeamId == null;
  const lostLast = lastGame != null && lastGame.winnerTeamId != null && lastGame.winnerTeamId !== teamId;
  const eliminated = seed != null && lostLast && playoffs.championTeamId !== teamId;

  return { seed, currentGame, lastGame, bye, eliminated };
}

export type LoopAction =
  | 'play-week'
  | 'begin-season'
  | 'set-bracket'
  | 'play-round'
  | 'signing-day'
  | 'record-season'
  | 'take-job'
  | 'begin-next-year';

export interface LoopStep {
  action: LoopAction;
  title: string;
  detail: string;
  button: string | null;
}

export function nextLoopStep(input: {
  phase: SeasonPhase;
  weekNumber: number;
  canPlayWeek: boolean;
  canSetBracket: boolean;
  canPlayRound: boolean;
  roundLabel: string | null;
  userPlaying: boolean;
  userBye: boolean;
  userEliminated: boolean;
  userMissedField: boolean;
  canSign: boolean;
  canRecordSeason: boolean;
  canBeginNextYear: boolean;
  fired?: boolean;
}): LoopStep {
  if (input.phase === 'PRE') {
    return {
      action: 'begin-season',
      title: 'Preseason',
      detail: 'Begin the year to open the weekly slate.',
      button: 'Begin season',
    };
  }

  if (input.phase === 'REGULAR' && input.canPlayWeek) {
    return {
      action: 'play-week',
      title: `Week ${input.weekNumber}`,
      detail: 'Plays every game this week, then updates recruiting and the roster.',
      button: `Play week ${input.weekNumber}`,
    };
  }

  if (input.phase === 'PLAYOFF' && input.canSetBracket) {
    return {
      action: 'set-bracket',
      title: 'Selection',
      detail: 'The regular season is over. Set the 12-team field. Seeds 1–4 get a bye.',
      button: 'Set the bracket',
    };
  }

  if (input.phase === 'PLAYOFF' && input.canPlayRound) {
    const roundLabel = input.roundLabel ?? 'this round';
    let detail = 'The rest of the field plays this round.';
    if (input.userPlaying) detail = 'Your program is in this round.';
    else if (input.userBye) detail = 'Your program has a bye. The rest of the first round still plays.';
    else if (input.userMissedField) detail = 'Your program missed the field. The bracket can still play out.';
    else if (input.userEliminated) detail = 'Your season is over. The bracket can still play out.';
    return {
      action: 'play-round',
      title: input.roundLabel ?? 'Playoffs',
      detail,
      button: input.userPlaying ? `Play ${roundLabel}` : `Sim ${roundLabel}`,
    };
  }

  if (input.phase === 'OFFSEASON' && input.canSign) {
    return {
      action: 'signing-day',
      title: 'Signing day',
      detail: 'Close the high school class. The portal and the pro draft stay on the office, and the next year does not wait on them.',
      button: 'Resolve signing day',
    };
  }

  if (input.phase === 'OFFSEASON' && input.canRecordSeason) {
    return {
      action: 'record-season',
      title: 'Record the year',
      detail: 'Write the record, job security, and the AD review into the career.',
      button: 'Record the season',
    };
  }

  if (input.phase === 'OFFSEASON' && input.fired && input.canBeginNextYear) {
    return {
      action: 'take-job',
      title: 'The AD let you go',
      detail: 'A landing job is on the office. The next year starts after you take it.',
      button: 'Take a job',
    };
  }

  if (input.phase === 'OFFSEASON' && input.canBeginNextYear) {
    return {
      action: 'begin-next-year',
      title: 'Next season',
      detail: 'The year is on the career. Start the next slate when the roster looks right.',
      button: 'Begin next season',
    };
  }

  if (input.phase === 'OFFSEASON') {
    return {
      action: 'begin-next-year',
      title: 'Offseason',
      detail: 'The office still has the class and the roster market.',
      button: null,
    };
  }

  return {
    action: 'play-week',
    title: 'Season',
    detail: 'This part of the year is already closed.',
    button: null,
  };
}
