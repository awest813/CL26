import { CoachArchetype, PracticeFocus, Tactics, TeamGameplayModifiers } from '../types/sim';

const FOCUS_TRANSLATION_BY_ARCHETYPE: Record<CoachArchetype, number> = {
  RECRUITER: 1,
  TACTICIAN: 1.25,
  DEVELOPER: 1.08,
};

const FOCUS_MODIFIERS: Record<PracticeFocus, TeamGameplayModifiers> = {
  OFFENSE: {
    offense: 4.2,
    defense: -1.2,
    goalie: 0,
    faceoff: 0,
    discipline: 0,
    shotQuality: 0.034,
    turnoverAvoidance: 0,
    penaltyAvoidance: 0,
    groundBallBonus: 0,
  },
  DEFENSE: {
    offense: -0.8,
    defense: 4,
    goalie: 2.2,
    faceoff: 0,
    discipline: 0,
    shotQuality: 0,
    turnoverAvoidance: 0,
    penaltyAvoidance: 0,
    groundBallBonus: 0,
  },
  DISCIPLINE: {
    offense: 0,
    defense: 0,
    goalie: 0,
    faceoff: 0,
    discipline: 7,
    shotQuality: 0,
    turnoverAvoidance: 0.05,
    penaltyAvoidance: 0.04,
    groundBallBonus: 0,
  },
  CONDITIONING: {
    offense: 0,
    defense: 1.4,
    goalie: 0,
    faceoff: 1.8,
    discipline: 0,
    shotQuality: 0,
    turnoverAvoidance: 0,
    penaltyAvoidance: 0,
    groundBallBonus: 3.5,
  },
};

const ARCHETYPE_BONUSES: Record<CoachArchetype, Partial<TeamGameplayModifiers>> = {
  RECRUITER: {},
  TACTICIAN: {
    offense: 0.8,
    defense: 0.8,
    shotQuality: 0.008,
  },
  DEVELOPER: {
    discipline: 1.6,
    groundBallBonus: 0.8,
  },
};

const FATIGUE_PENALTY_START = 24;
const FATIGUE_PENALTY_RANGE = 76;
const CONDITIONING_FATIGUE_REDUCTION = 0.52;
const TACTICIAN_FATIGUE_MITIGATION = 0.88;
const DEVELOPER_FATIGUE_MITIGATION = 0.94;
const SHOT_QUALITY_MIN = -0.08;
const SHOT_QUALITY_MAX = 0.08;
const TURNOVER_AVOIDANCE_MAX = 0.12;
const PENALTY_AVOIDANCE_MAX = 0.1;
const FATIGUE_PENALTIES: Pick<TeamGameplayModifiers, 'offense' | 'defense' | 'goalie' | 'faceoff' | 'discipline' | 'shotQuality' | 'groundBallBonus'> = {
  offense: 5.2,
  defense: 4.4,
  goalie: 2.6,
  faceoff: 3.8,
  discipline: 4.8,
  shotQuality: 0.028,
  groundBallBonus: 2.4,
};

export interface CoachWeekSettings {
  baseTactics: Tactics;
  practiceFocus: PracticeFocus;
  fatigue: number;
  archetype?: CoachArchetype;
}

export interface CoachGamePlan {
  tactics: Tactics;
  modifiers: TeamGameplayModifiers;
  fatigueLabel: 'Fresh' | 'Managed' | 'Worn' | 'Drained';
  focusLabel: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const roundToThreeDecimals = (value: number): number => Number(value.toFixed(3));

function blankGameplayModifiers(): TeamGameplayModifiers {
  return {
    offense: 0,
    defense: 0,
    goalie: 0,
    faceoff: 0,
    discipline: 0,
    shotQuality: 0,
    turnoverAvoidance: 0,
    penaltyAvoidance: 0,
    groundBallBonus: 0,
  };
}

export function applyCoachWeekSettings(settings: CoachWeekSettings): Tactics {
  const next: Tactics = { ...settings.baseTactics };

  if (settings.practiceFocus === 'OFFENSE') {
    next.tempo = 'fast';
    next.slideAggression = 'late';
  }

  if (settings.practiceFocus === 'DEFENSE') {
    next.slideAggression = 'early';
    next.rideClear = 'aggressive';
  }

  if (settings.practiceFocus === 'DISCIPLINE') {
    next.rideClear = 'conservative';
  }

  const fatigue = clamp(settings.fatigue, 0, 100);
  if (fatigue >= 65) {
    next.tempo = 'slow';
    if (next.rideClear === 'aggressive') {
      next.rideClear = 'balanced';
    }
  }

  if (settings.practiceFocus === 'CONDITIONING' && fatigue <= 40 && next.tempo === 'slow') {
    next.tempo = 'normal';
  }

  return next;
}

function fatigueLabelFor(value: number): CoachGamePlan['fatigueLabel'] {
  if (value >= 78) return 'Drained';
  if (value >= 58) return 'Worn';
  if (value >= 34) return 'Managed';
  return 'Fresh';
}

function focusLabelFor(focus: PracticeFocus): string {
  if (focus === 'OFFENSE') return 'Offense install';
  if (focus === 'DEFENSE') return 'Defense install';
  if (focus === 'DISCIPLINE') return 'Discipline emphasis';
  return 'Conditioning block';
}

export function buildCoachGamePlan(settings: CoachWeekSettings): CoachGamePlan {
  const fatigue = clamp(settings.fatigue, 0, 100);
  const archetype = settings.archetype ?? 'RECRUITER';
  const tactics = applyCoachWeekSettings(settings);
  const modifiers = blankGameplayModifiers();
  const focusTranslation = FOCUS_TRANSLATION_BY_ARCHETYPE[archetype];
  const focusModifiers = FOCUS_MODIFIERS[settings.practiceFocus];

  modifiers.offense += focusModifiers.offense * focusTranslation;
  modifiers.defense += focusModifiers.defense * focusTranslation;
  modifiers.goalie += focusModifiers.goalie * focusTranslation;
  modifiers.faceoff += focusModifiers.faceoff * focusTranslation;
  modifiers.discipline += focusModifiers.discipline * focusTranslation;
  modifiers.shotQuality += focusModifiers.shotQuality * focusTranslation;
  modifiers.turnoverAvoidance += focusModifiers.turnoverAvoidance * focusTranslation;
  modifiers.penaltyAvoidance += focusModifiers.penaltyAvoidance * focusTranslation;
  modifiers.groundBallBonus += focusModifiers.groundBallBonus * focusTranslation;

  const archetypeBonus = ARCHETYPE_BONUSES[archetype];
  modifiers.offense += archetypeBonus.offense ?? 0;
  modifiers.defense += archetypeBonus.defense ?? 0;
  modifiers.discipline += archetypeBonus.discipline ?? 0;
  modifiers.shotQuality += archetypeBonus.shotQuality ?? 0;
  modifiers.groundBallBonus += archetypeBonus.groundBallBonus ?? 0;

  const fatiguePenaltyBase = clamp((fatigue - FATIGUE_PENALTY_START) / FATIGUE_PENALTY_RANGE, 0, 1);
  let fatiguePenaltyScale = settings.practiceFocus === 'CONDITIONING' ? CONDITIONING_FATIGUE_REDUCTION : 1;
  if (archetype === 'TACTICIAN') fatiguePenaltyScale *= TACTICIAN_FATIGUE_MITIGATION;
  if (archetype === 'DEVELOPER') fatiguePenaltyScale *= DEVELOPER_FATIGUE_MITIGATION;
  const fatiguePenalty = fatiguePenaltyBase * fatiguePenaltyScale;

  modifiers.offense -= fatiguePenalty * FATIGUE_PENALTIES.offense;
  modifiers.defense -= fatiguePenalty * FATIGUE_PENALTIES.defense;
  modifiers.goalie -= fatiguePenalty * FATIGUE_PENALTIES.goalie;
  modifiers.faceoff -= fatiguePenalty * FATIGUE_PENALTIES.faceoff;
  modifiers.discipline -= fatiguePenalty * FATIGUE_PENALTIES.discipline;
  modifiers.shotQuality -= fatiguePenalty * FATIGUE_PENALTIES.shotQuality;
  modifiers.groundBallBonus -= fatiguePenalty * FATIGUE_PENALTIES.groundBallBonus;

  return {
    tactics,
    modifiers: {
      offense: roundToThreeDecimals(modifiers.offense),
      defense: roundToThreeDecimals(modifiers.defense),
      goalie: roundToThreeDecimals(modifiers.goalie),
      faceoff: roundToThreeDecimals(modifiers.faceoff),
      discipline: roundToThreeDecimals(modifiers.discipline),
      shotQuality: roundToThreeDecimals(clamp(modifiers.shotQuality, SHOT_QUALITY_MIN, SHOT_QUALITY_MAX)),
      turnoverAvoidance: roundToThreeDecimals(clamp(modifiers.turnoverAvoidance, 0, TURNOVER_AVOIDANCE_MAX)),
      penaltyAvoidance: roundToThreeDecimals(clamp(modifiers.penaltyAvoidance, 0, PENALTY_AVOIDANCE_MAX)),
      groundBallBonus: roundToThreeDecimals(modifiers.groundBallBonus),
    },
    fatigueLabel: fatigueLabelFor(fatigue),
    focusLabel: focusLabelFor(settings.practiceFocus),
  };
}

export function summarizeCoachGamePlan(plan: CoachGamePlan): string[] {
  const lines: string[] = [];

  if (plan.modifiers.offense >= 2 || plan.modifiers.shotQuality >= 0.02) {
    lines.push('Sharper offensive execution and cleaner shot creation this week.');
  }

  if (plan.modifiers.defense >= 2 || plan.modifiers.goalie >= 1.5) {
    lines.push('Defensive structure should hold up better in settled possessions.');
  }

  if (plan.modifiers.discipline >= 3 || plan.modifiers.turnoverAvoidance >= 0.03) {
    lines.push('Preparation should cut empty possessions and avoidable flags.');
  }

  if (plan.modifiers.groundBallBonus >= 2 || plan.modifiers.faceoff >= 1.5) {
    lines.push('Conditioning edge projects to show up in scrums and faceoffs.');
  }

  if (plan.fatigueLabel === 'Worn' || plan.fatigueLabel === 'Drained') {
    lines.push('Fatigue is starting to drag execution, so load management matters.');
  }

  return lines.slice(0, 3);
}

export function advanceFatigue(
  previousFatigue: number,
  focus: PracticeFocus,
  archetype: CoachArchetype = 'RECRUITER',
): number {
  const bounded = clamp(previousFatigue, 0, 100);

  const byFocus: Record<PracticeFocus, number> = {
    OFFENSE: 8,
    DEFENSE: 9,
    CONDITIONING: 3,
    DISCIPLINE: 5,
  };

  const recovery = focus === 'CONDITIONING' ? 6 : 2;
  const rawDelta = byFocus[focus] - recovery;

  // TACTICIAN manages player loads better: 20% less net fatigue accumulation
  const archetypeReduction = archetype === 'TACTICIAN' ? 0.8 : 1.0;
  return clamp(bounded + rawDelta * archetypeReduction, 0, 100);
}
