import type { Position } from '../types/sim.ts';

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
  hasRoster: boolean;
  positionNeeds: Record<Position, number>;
  wins: number;
  winTarget: number;
  pollRank: number | null;
  pollKnown: boolean;
  rankTarget: number;
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
  const winsLine = `${input.wins} of ${input.winTarget} wins`;
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

function recruitingTask(input: WeeklyDeskInput): DeskTask {
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
  if (input.phase === 'PLAYOFF' || input.phase === 'OFFSEASON') {
    return {
      id: 'plan',
      title: 'Game plan',
      detail: 'The weekly install waits for the next regular season.',
      tone: 'ready',
      action: 'Scheme',
      href: '/career',
    };
  }
  return {
    id: 'plan',
    title: 'Game plan',
    detail: `${input.practiceLabel}. ${input.practiceDetail} ${input.schemeLine}.`,
    tone: 'ready',
    action: 'Set below',
    href: null,
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
