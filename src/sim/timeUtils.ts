import { REGULATION_SECONDS, PERIOD_LENGTH_SECONDS, PERIODS } from './gameRules.ts';

export function clockForPossession(
  pos: number,
  total: number,
  options?: { overtimePeriod?: number },
): { quarter: number; time: string; label: string } {
  if (options?.overtimePeriod && options.overtimePeriod > 0) {
    const ot = options.overtimePeriod;
    const label = ot === 1 ? 'OT' : `OT${ot}`;
    // Compact sudden-death clock abstraction: count down a short OT window.
    const otSeconds = 240;
    const elapsed = Math.floor((pos / Math.max(total, 1)) * otSeconds) % otSeconds;
    const remain = Math.max(0, otSeconds - elapsed);
    const mins = Math.floor(remain / 60).toString();
    const secs = (remain % 60).toString().padStart(2, '0');
    return { quarter: PERIODS + ot, time: `${mins}:${secs}`, label };
  }

  const gameSeconds = REGULATION_SECONDS;
  const elapsed = Math.floor((pos / Math.max(total, 1)) * gameSeconds);
  const quarter = Math.min(PERIODS, Math.floor(elapsed / PERIOD_LENGTH_SECONDS) + 1);
  const quarterElapsed = elapsed % PERIOD_LENGTH_SECONDS;
  const remain = PERIOD_LENGTH_SECONDS - quarterElapsed;
  const mins = Math.floor(remain / 60).toString();
  const secs = (remain % 60).toString().padStart(2, '0');
  return { quarter, time: `${mins}:${secs}`, label: `Q${quarter}` };
}
