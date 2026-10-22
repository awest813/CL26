import { PRACTICE_FOCUS_DETAILS, PRACTICE_FOCUS_LABELS, weeklyFatigueChange } from '../sim/coachEffects';
import type { CoachGamePlan, TacticChange } from '../sim/coachEffects';
import { tacticRatingShift } from '../sim/matchEngine';
import { scoutOpponent } from '../sim/schemeMatchups';
import { INSTALL_GROWTH_TRAITS } from '../sim/rosterManagement';
import { TACTIC_FIELDS, tacticHint, tacticShortLabel, tacticValue } from '../lib/tacticLabels';
import type { CoachArchetype, PracticeFocus, Tactics } from '../types/sim';

const INSTALL_ORDER: PracticeFocus[] = ['OFFENSE', 'DEFENSE', 'CONDITIONING', 'DISCIPLINE'];

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0.0';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : `−${Math.abs(rounded).toFixed(1)}`;
}

function growthLine(focus: PracticeFocus): string {
  const traits: string[] = INSTALL_GROWTH_TRAITS[focus];
  const list = traits.length > 1 ? `${traits.slice(0, -1).join(', ')} and ${traits[traits.length - 1]}` : traits[0];
  return `Grows ${list}.`;
}

type TacticSelectsProps = {
  tactics: Tactics;
  onChange: (next: Tactics) => void;
  /** Prefix for the select ids, so two sets on one page stay unique. */
  idPrefix: string;
};

/** The five base-scheme calls as selects, each with the trade-off of the current call under it. */
export function TacticSelects({ tactics, onChange, idPrefix }: TacticSelectsProps) {
  return (
    <div className="tacticGrid">
      {TACTIC_FIELDS.map((field) => {
        const value = tacticValue(tactics, field.key);
        const hintId = `${idPrefix}-${field.key}-hint`;
        return (
          <label key={field.key} className="tacticField" htmlFor={`${idPrefix}-${field.key}`}>
            <span className="tacticFieldLabel">{field.label}</span>
            <select
              id={`${idPrefix}-${field.key}`}
              value={value}
              aria-describedby={hintId}
              onChange={(event) => onChange({ ...tactics, [field.key]: event.target.value } as Tactics)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span id={hintId} className="tacticHint">
              {tacticHint(field.key, value) || 'No trade-off.'}
            </span>
          </label>
        );
      })}
    </div>
  );
}

type InstallPickerProps = {
  value: PracticeFocus;
  onChange: (focus: PracticeFocus) => void;
  archetype?: CoachArchetype;
  operationsSkill?: number;
  /** From the strength coach. */
  staffFatigueScale?: number;
};

/** The four installs, each with what it does on game day, what it grows, and what a week of it costs in fatigue. */
export function InstallPicker({ value, onChange, archetype, operationsSkill, staffFatigueScale }: InstallPickerProps) {
  return (
    <div className="choiceGrid installPicker" role="group" aria-label="This week's install">
      {INSTALL_ORDER.map((focus) => {
        const change = weeklyFatigueChange(focus, archetype, operationsSkill, staffFatigueScale);
        return (
          <button
            key={focus}
            type="button"
            aria-pressed={value === focus}
            onClick={() => onChange(focus)}
            className="choiceChip"
          >
            <span className="choiceChipHead">
              <span className="font-semibold">{PRACTICE_FOCUS_LABELS[focus]}</span>
              <span className={`installLoad ${change > 0 ? 'installLoad-up' : 'installLoad-down'}`}>
                {change > 0 ? '+' : '−'}{Math.abs(change)} fatigue
              </span>
            </span>
            <span className="choiceChipHelp">{PRACTICE_FOCUS_DETAILS[focus]}</span>
            <span className="choiceChipGrowth">{growthLine(focus)}</span>
          </button>
        );
      })}
    </div>
  );
}

const CAUSE_LABEL: Record<TacticChange['cause'], string> = {
  install: 'Install',
  fatigue: 'Fatigue',
};

type GameDaySchemeProps = {
  plan: CoachGamePlan;
  changes: TacticChange[];
};

/** The calls the team plays this week, with the ones the install or fatigue overrode marked. */
export function GameDayScheme({ plan, changes }: GameDaySchemeProps) {
  const changeByKey = new Map(changes.map((change) => [change.key, change]));
  return (
    <ul className="schemeList" aria-label="Game-day scheme">
      {TACTIC_FIELDS.map((field) => {
        const value = tacticValue(plan.tactics, field.key);
        const change = changeByKey.get(field.key as TacticChange['key']);
        return (
          <li key={field.key} className={change ? `schemeCall schemeCall-${change.cause}` : 'schemeCall'}>
            <span>{tacticShortLabel(field.key, value)}</span>
            {change && (
              <span className="schemeCallCause">
                {CAUSE_LABEL[change.cause]}
                <span className="sr-only">, base call {tacticShortLabel(field.key, change.from)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Offense, defense, and ground balls include the scheme's shift against this week's opponent
 * (a standard man look when there is none); the rest come from the install, staff, and fatigue.
 */
function gameDayEdge(plan: CoachGamePlan, opponent?: Tactics) {
  const shift = tacticRatingShift(plan.tactics, opponent);
  return [
    { key: 'off', label: 'Offense', short: 'Off', value: plan.modifiers.offense + shift.offense },
    { key: 'def', label: 'Defense', short: 'Def', value: plan.modifiers.defense + shift.defense },
    { key: 'g', label: 'Goalie', short: 'G', value: plan.modifiers.goalie },
    { key: 'fo', label: 'Faceoffs', short: 'FO', value: plan.modifiers.faceoff },
    { key: 'gb', label: 'Ground balls', short: 'GB', value: plan.modifiers.groundBallBonus + shift.groundBalls },
    { key: 'disc', label: 'Discipline', short: 'Disc', value: plan.modifiers.discipline },
  ];
}

/** The game-day edge as one row of small figures. */
export function GameDayEdge({ plan, opponent }: { plan: CoachGamePlan; opponent?: Tactics }) {
  return (
    <dl className="edgeGrid" aria-label="Game-day edge">
      {gameDayEdge(plan, opponent).map((row) => (
        <div
          key={row.key}
          className={`edgeCell ${row.value >= 0.05 ? 'edgeCell-up' : row.value <= -0.05 ? 'edgeCell-down' : ''}`}
        >
          <dt>
            <abbr title={row.label}>{row.short}</abbr>
          </dt>
          <dd>{signed(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

type ScoutingReportProps = {
  plan: CoachGamePlan;
  /** What they will run against this week's calls. */
  opponent: Tactics;
  /** Their usual scheme, to say what their staff changed for you. */
  opponentBase?: Tactics;
  opponentName: string;
  /** What their staff would run against a different set of calls. */
  respond?: (calls: Tactics) => Tactics;
};

/** The opponent's scheme, how this week's calls line up with it, and the call that would line up better. */
export function ScoutingReport({ plan, opponent, opponentBase, opponentName, respond }: ScoutingReportProps) {
  const adjustments = opponentBase
    ? (['defensePackage', 'offenseSet'] as const)
        .filter((key) => tacticValue(opponent, key) !== tacticValue(opponentBase, key))
        .map((key) => `${tacticShortLabel(key, tacticValue(opponent, key)).toLowerCase()} instead of their usual ${tacticShortLabel(key, tacticValue(opponentBase, key)).toLowerCase()}`)
    : [];
  const report = scoutOpponent(plan.tactics, opponent, respond);
  const yourOffense = tacticShortLabel('offenseSet', tacticValue(plan.tactics, 'offenseSet'));
  const yourDefense = tacticShortLabel('defensePackage', tacticValue(plan.tactics, 'defensePackage'));
  const theirOffense = tacticShortLabel('offenseSet', tacticValue(opponent, 'offenseSet'));
  const theirDefense = tacticShortLabel('defensePackage', tacticValue(opponent, 'defensePackage'));
  const betterOffense = report.bestOffenseEdge > report.offenseEdge
    ? `${tacticShortLabel('offenseSet', report.bestOffenseSet)} would be ${signed(report.bestOffenseEdge)}.`
    : 'Nothing lines up better.';
  const betterDefense = report.bestDefenseEdge > report.defenseEdge
    ? `${tacticShortLabel('defensePackage', report.bestDefensePackage)} would be ${signed(report.bestDefenseEdge)} for you.`
    : 'Nothing lines up better.';

  return (
    <div className="scoutingReport">
      <ul className="schemeList" aria-label={`${opponentName} scheme`}>
        {TACTIC_FIELDS.map((field) => (
          <li key={field.key} className="schemeCall">
            <span>{tacticShortLabel(field.key, tacticValue(opponent, field.key))}</span>
          </li>
        ))}
      </ul>
      <ul className="scoutingLines">
        {adjustments.length > 0 && (
          <li>
            Their staff is adjusting to your calls: {adjustments.join(' and ')}.
          </li>
        )}
        <li>
          Your {yourOffense.toLowerCase()} against their {theirDefense.toLowerCase()}: <strong>{signed(report.offenseEdge)}</strong>. {betterOffense}
        </li>
        <li>
          Their {theirOffense.toLowerCase()} against your {yourDefense.toLowerCase()}: <strong>{signed(report.defenseEdge)}</strong> for you. {betterDefense}
        </li>
      </ul>
    </div>
  );
}
