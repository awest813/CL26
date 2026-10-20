import type { Tactics } from '../types/sim';

type TacticKey = 'tempo' | 'rideClear' | 'slideAggression' | 'offenseSet' | 'defensePackage';

type TacticOption = {
  value: string;
  /** The option's name in a select. */
  label: string;
  /** The trade-off, as the match engine plays it. A neutral call has none. */
  hint?: string;
  /** How a readout names the call, e.g. "Fast tempo". */
  short: string;
};

type TacticField = {
  key: TacticKey;
  label: string;
  options: TacticOption[];
};

/** The five scheme calls, shared by the Coach Office game plan and the exhibition. */
export const TACTIC_FIELDS: TacticField[] = [
  {
    key: 'tempo',
    label: 'Tempo',
    options: [
      { value: 'slow', label: 'Slow', hint: 'fewer possessions', short: 'Slow tempo' },
      { value: 'normal', label: 'Balanced', short: 'Balanced tempo' },
      { value: 'fast', label: 'Fast', hint: 'more possessions', short: 'Fast tempo' },
    ],
  },
  {
    key: 'rideClear',
    label: 'Ride / clear',
    options: [
      { value: 'conservative', label: 'Conservative', hint: 'safer clears, less offense', short: 'Safe clears' },
      { value: 'balanced', label: 'Balanced', short: 'Balanced ride' },
      { value: 'aggressive', label: 'Aggressive', hint: 'more offense, riskier clears', short: 'Hard ride' },
    ],
  },
  {
    key: 'slideAggression',
    label: 'Slide timing',
    options: [
      { value: 'early', label: 'Early', hint: 'stronger defense, more fouls', short: 'Early slides' },
      { value: 'normal', label: 'Standard', short: 'Standard slides' },
      { value: 'late', label: 'Late', hint: 'more offense, softer defense', short: 'Late slides' },
    ],
  },
  {
    key: 'offenseSet',
    label: 'Offense set',
    options: [
      { value: 'balanced', label: 'Balanced', short: 'Balanced offense' },
      { value: 'motion', label: 'Motion', hint: 'better looks, fewer turnovers', short: 'Motion offense' },
      { value: 'invert', label: 'Invert', hint: 'biggest push, more turnovers', short: 'Invert offense' },
      { value: 'crease', label: 'Crease', hint: 'best shots inside', short: 'Crease offense' },
    ],
  },
  {
    key: 'defensePackage',
    label: 'Defense package',
    options: [
      { value: 'man', label: 'Man-to-man', short: 'Man defense' },
      { value: 'zone', label: 'Zone', hint: 'steady defense, fewer takeaways', short: 'Zone defense' },
      { value: 'pressure', label: 'Pressure', hint: 'strongest defense, more fouls', short: 'Pressure defense' },
    ],
  },
];

const DEFAULTS: Record<TacticKey, string> = {
  tempo: 'normal',
  rideClear: 'balanced',
  slideAggression: 'normal',
  offenseSet: 'balanced',
  defensePackage: 'man',
};

export function tacticValue(tactics: Tactics, key: TacticKey): string {
  return tactics[key] ?? DEFAULTS[key];
}

/** The current call's trade-off, e.g. "More possessions." A neutral call has none and returns ''. */
export function tacticHint(key: TacticKey, value: string): string {
  const field = TACTIC_FIELDS.find((row) => row.key === key);
  const hint = field?.options.find((option) => option.value === value)?.hint;
  if (!hint) return '';
  return `${hint.charAt(0).toUpperCase()}${hint.slice(1)}.`;
}

/** "Fast tempo", "Pressure defense", and so on. */
export function tacticShortLabel(key: TacticKey, value: string): string {
  const field = TACTIC_FIELDS.find((row) => row.key === key);
  return field?.options.find((option) => option.value === value)?.short ?? value;
}
