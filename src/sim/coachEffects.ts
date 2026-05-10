import { PracticeFocus, Tactics, TeamGameplayModifiers } from '../types/sim';

type CoachArchetype = 'RECRUITER' | 'TACTICIAN' | 'DEVELOPER';

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
const clampModifier = (value: number): number => Number(value.toFixed(3));

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

  const focusTranslation =
    archetype === 'TACTICIAN'
      ? 1.25
      : archetype === 'DEVELOPER'
        ? 1.08
        : 1;

  if (settings.practiceFocus === 'OFFENSE') {
    modifiers.offense += 4.2 * focusTranslation;
    modifiers.shotQuality += 0.034 * focusTranslation;
    modifiers.defense -= 1.2;
  }

  if (settings.practiceFocus === 'DEFENSE') {
    modifiers.defense += 4 * focusTranslation;
    modifiers.goalie += 2.2 * focusTranslation;
    modifiers.offense -= 0.8;
  }

  if (settings.practiceFocus === 'DISCIPLINE') {
    modifiers.discipline += 7 * focusTranslation;
    modifiers.turnoverAvoidance += 0.05 * focusTranslation;
    modifiers.penaltyAvoidance += 0.04 * focusTranslation;
  }

  if (settings.practiceFocus === 'CONDITIONING') {
    modifiers.faceoff += 1.8 * focusTranslation;
    modifiers.groundBallBonus += 3.5 * focusTranslation;
    modifiers.defense += 1.4;
  }

  if (archetype === 'TACTICIAN') {
    modifiers.offense += 0.8;
    modifiers.defense += 0.8;
    modifiers.shotQuality += 0.008;
  }

  if (archetype === 'DEVELOPER') {
    modifiers.discipline += 1.6;
    modifiers.groundBallBonus += 0.8;
  }

  const fatiguePenaltyBase = clamp((fatigue - 24) / 76, 0, 1);
  let fatiguePenaltyScale = settings.practiceFocus === 'CONDITIONING' ? 0.52 : 1;
  if (archetype === 'TACTICIAN') fatiguePenaltyScale *= 0.88;
  if (archetype === 'DEVELOPER') fatiguePenaltyScale *= 0.94;
  const fatiguePenalty = fatiguePenaltyBase * fatiguePenaltyScale;

  modifiers.offense -= fatiguePenalty * 5.2;
  modifiers.defense -= fatiguePenalty * 4.4;
  modifiers.goalie -= fatiguePenalty * 2.6;
  modifiers.faceoff -= fatiguePenalty * 3.8;
  modifiers.discipline -= fatiguePenalty * 4.8;
  modifiers.shotQuality -= fatiguePenalty * 0.028;
  modifiers.groundBallBonus -= fatiguePenalty * 2.4;

  return {
    tactics,
    modifiers: {
      offense: clampModifier(modifiers.offense),
      defense: clampModifier(modifiers.defense),
      goalie: clampModifier(modifiers.goalie),
      faceoff: clampModifier(modifiers.faceoff),
      discipline: clampModifier(modifiers.discipline),
      shotQuality: clampModifier(clamp(modifiers.shotQuality, -0.08, 0.08)),
      turnoverAvoidance: clampModifier(clamp(modifiers.turnoverAvoidance, 0, 0.12)),
      penaltyAvoidance: clampModifier(clamp(modifiers.penaltyAvoidance, 0, 0.1)),
      groundBallBonus: clampModifier(modifiers.groundBallBonus),
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
