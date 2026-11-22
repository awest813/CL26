import type { Position } from '../types/sim.ts';
import { FATIGUE_SLOWDOWN_THRESHOLD } from './coachEffects.ts';

export type DeskTone = 'ready' | 'open' | 'watch';
export type SeasonPhase = 'PRE' | 'REGULAR' | 'PLAYOFF' | 'OFFSEASON';

export interface DeskTask {
  id: 'plan' | 'recruiting' | 'needs' | 'ad';
  title: string;
  detail: string;
  tone: DeskTone;
  action: string;
  href: string | null;
}

export interface WeeklyDeskInput {
  phase: SeasonPhase;
  practiceLabel: string;
  practiceDetail: string;
  schemeLine: string;
  recruitPoolCount: number;
  boardCount: number;
  hoursAssigned: number;
  hoursCap: number;
  /** Staff sets the board and hours before each week. */
  autoRecruiting?: boolean;
  /** Prospects committed to the program so far this cycle, and scholarships to fill. */
  commits?: number;
  scholarships?: number;
  /** Regular-season weeks already played, and how many there are. */
  weeksPlayed?: number;
  weeksTotal?: number;
  hasRoster: boolean;
  positionNeeds: Record<Position, number>;
  wins: number;
  winTarget: number;
  pollRank: number | null;
  pollKnown: boolean;
  rankTarget: number;
  /** In the playoffs: your program still has a game to play, so the install still applies. */
  inBracket?: boolean;
  /** Team fatigue, 0–100. At the slowdown threshold the plan row turns to a warning. */
  fatigue?: number;
}

const POSITION_NAMES: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  LSM: 'LSM',
  FO: 'Faceoff',
  G: 'Goalie',
};

export function adGoalCopy(input: Pick<WeeklyDeskInput, 'wins' | 'winTarget' | 'pollRank' | 'pollKnown' | 'rankTarget'>): {
  detail: string;
  tone: DeskTone;
} {
  const winsLine = input.wins >= input.winTarget
    ? `${input.wins} wins, past the target of ${input.winTarget}`
    : `${input.wins} of ${input.winTarget} wins`;
  let rankLine = `Target is a Top ${input.rankTarget} finish.`;
  if (input.pollKnown && input.pollRank != null) {
    rankLine = `Poll #${input.pollRank}. Target is Top ${input.rankTarget}.`;
  } else if (input.pollKnown) {
    rankLine = `Outside the Top 25. Target is Top ${input.rankTarget}.`;
  }

  let tone: DeskTone = 'open';
  if (input.pollKnown && input.pollRank != null && input.pollRank > input.rankTarget) tone = 'watch';
  else if (input.pollKnown && input.pollRank == null && input.rankTarget <= 25) tone = 'watch';
  else if (input.wins >= input.winTarget && (!input.pollKnown || (input.pollRank != null && input.pollRank <= input.rankTarget))) {
    tone = 'ready';
  }

  return { detail: `${winsLine}. ${rankLine}`, tone };
}

/** Weeks before the class is judged: early commitments are rare even for a full class. */
const PACE_GRACE_WEEKS = 3;
/** Half the pace a staff-run board keeps (half the class by week 5, all of it by week 10). */
const PACE_SHARE = 0.5;

/** Commits a class should have by now to be on track; a class below it is flagged. */
export function classPaceFloor(scholarships: number, weeksPlayed: number, weeksTotal: number): number {
  const span = Math.max(1, weeksTotal - PACE_GRACE_WEEKS);
  const progress = Math.max(0, Math.min(1, (weeksPlayed - PACE_GRACE_WEEKS) / span));
  return Math.floor(scholarships * progress * PACE_SHARE);
}

/** A warning when the class trails the pace, or null. Unfilled scholarships go to walk-ons. */
function classPaceWarning(input: WeeklyDeskInput): string | null {
  const { commits, scholarships, weeksPlayed, weeksTotal } = input;
  if (commits == null || !scholarships || weeksPlayed == null || !weeksTotal) return null;
  // After the last regular-season week no recruiting period is left to act on.
  if (weeksPlayed >= weeksTotal) return null;
  if (weeksPlayed < PACE_GRACE_WEEKS * 2 || commits >= classPaceFloor(scholarships, weeksPlayed, weeksTotal)) return null;
  const weeksLeft = Math.max(0, weeksTotal - weeksPlayed);
  const commitLine = `${commits} commit${commits === 1 ? '' : 's'} for ${scholarships} scholarships`;
  return `${commitLine} with ${weeksLeft} week${weeksLeft === 1 ? '' : 's'} left. Open scholarships go to walk-ons, a step below recruits. Swap Reach and Long shot targets for Good fit and Strong pull, or let your staff run recruiting.`;
}

function recruitingTask(input: WeeklyDeskInput): DeskTask {
  if (input.phase === 'OFFSEASON') {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: 'The high school class is closed. The portal, the pro draft, head-coaching jobs, and assistant hires are in the Coach Office.',
      tone: 'open',
      action: 'Office',
      href: '/career',
    };
  }
  if (input.phase === 'PLAYOFF') {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: 'Hours pause while the bracket is live. The board is still there.',
      tone: 'ready',
      action: 'Board',
      href: '/career/recruiting',
    };
  }
  if (input.recruitPoolCount === 0) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: 'Open a class so the week has prospects to work.',
      tone: 'open',
      action: 'Start class',
      href: '/career',
    };
  }
  if (input.autoRecruiting) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: 'Your staff sets the board, hours, and pitches before each week.',
      tone: 'ready',
      action: 'Board',
      href: '/career/recruiting',
    };
  }
  if (input.boardCount === 0) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: 'The class is open. Add targets before the hours sit unused.',
      tone: 'open',
      action: 'Add targets',
      href: '/career/recruiting',
    };
  }
  const behind = input.phase === 'REGULAR' ? classPaceWarning(input) : null;
  if (behind) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: behind,
      tone: 'watch',
      action: 'Board',
      href: '/career/recruiting',
    };
  }
  const left = input.hoursCap - input.hoursAssigned;
  if (left > 0) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: `${left} of ${input.hoursCap} hours are still open across ${input.boardCount} targets.`,
      tone: 'open',
      action: 'Assign hours',
      href: '/career/recruiting',
    };
  }
  if (left < 0) {
    return {
      id: 'recruiting',
      title: 'Recruiting',
      detail: `The board is ${Math.abs(left)} hours over the weekly cap.`,
      tone: 'watch',
      action: 'Trim hours',
      href: '/career/recruiting',
    };
  }
  return {
    id: 'recruiting',
    title: 'Recruiting',
    detail: `All ${input.hoursCap} hours are assigned.`,
    tone: 'ready',
    action: 'Board',
    href: '/career/recruiting',
  };
}

function needsTask(input: WeeklyDeskInput): DeskTask {
  if (!input.hasRoster) {
    return {
      id: 'needs',
      title: 'Roster needs',
      detail: 'The roster has not been drawn yet.',
      tone: 'open',
      action: 'Roster',
      href: '/career/roster',
    };
  }
  const shorts = (Object.entries(input.positionNeeds) as Array<[Position, number]>)
    .filter(([, need]) => need > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (shorts.length === 0) {
    return {
      id: 'needs',
      title: 'Roster needs',
      detail: 'Every position meets the roster target.',
      tone: 'ready',
      action: 'Roster',
      href: '/career/roster',
    };
  }
  const shown = shorts.slice(0, 3).map(([position, need]) => `${POSITION_NAMES[position]} ${need}`);
  const extra = shorts.length > 3 ? ` +${shorts.length - 3} more` : '';
  return {
    id: 'needs',
    title: 'Roster needs',
    detail: `Short ${shown.join(' · ')}${extra}.`,
    tone: 'watch',
    action: 'Depth chart',
    href: '/career/roster',
  };
}

function planTask(input: WeeklyDeskInput): DeskTask {
  if ((input.phase === 'PLAYOFF' && !input.inBracket) || input.phase === 'OFFSEASON') {
    return {
      id: 'plan',
      title: 'Game plan',
      detail: 'The weekly install waits for the next regular season.',
      tone: 'ready',
      action: 'Scheme',
      href: '/career',
    };
  }
  const fatigue = Math.round(input.fatigue ?? 0);
  if (fatigue >= FATIGUE_SLOWDOWN_THRESHOLD) {
    return {
      id: 'plan',
      title: 'Game plan',
      detail: `Fatigue is ${fatigue}%, so the team plays slow and every edge drags. Conditioning recovers legs. ${input.practiceLabel} is set.`,
      tone: 'watch',
      action: 'Install',
      href: '#week-practice',
    };
  }
  return {
    id: 'plan',
    title: 'Game plan',
    detail: `${input.practiceLabel}. ${input.practiceDetail} ${input.schemeLine}.`,
    tone: 'ready',
    action: 'Install',
    href: '#week-practice',
  };
}

export function buildWeeklyDesk(input: WeeklyDeskInput): DeskTask[] {
  const goal = adGoalCopy(input);
  return [
    planTask(input),
    recruitingTask(input),
    needsTask(input),
    {
      id: 'ad',
      title: 'AD goal',
      detail: goal.detail,
      tone: goal.tone,
      action: 'Office',
      href: '/career',
    },
  ];
}
