import { REGULATION_SECONDS, PERIOD_LENGTH_SECONDS, PERIODS } from './gameRules.ts';

/** Length of one sudden-death overtime period in seconds (NCAA men's: 4 minutes). */
export const OVERTIME_PERIOD_SECONDS = 240;

function formatRemaining(remain: number): string {
  const bounded = Math.max(0, Math.round(remain));
  const mins = Math.floor(bounded / 60).toString();
  const secs = (bounded % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * Game clock from elapsed seconds. Regulation counts down each 15-minute quarter;
 * with `overtimePeriod`, `elapsed` is seconds into that overtime period.
 */
export function clockAtElapsed(
  elapsed: number,
  options?: { overtimePeriod?: number },
): { quarter: number; time: string; label: string } {
  if (options?.overtimePeriod && options.overtimePeriod > 0) {
    const ot = options.overtimePeriod;
    const label = ot === 1 ? 'OT' : `OT${ot}`;
    const into = Math.min(OVERTIME_PERIOD_SECONDS, Math.max(0, elapsed));
    return { quarter: PERIODS + ot, time: formatRemaining(OVERTIME_PERIOD_SECONDS - into), label };
  }

  const bounded = Math.min(REGULATION_SECONDS, Math.max(0, elapsed));
  const quarter = Math.min(PERIODS, Math.floor(bounded / PERIOD_LENGTH_SECONDS) + 1);
  const quarterElapsed = bounded - (quarter - 1) * PERIOD_LENGTH_SECONDS;
  return { quarter, time: formatRemaining(PERIOD_LENGTH_SECONDS - quarterElapsed), label: `Q${quarter}` };
}
