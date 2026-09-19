export type SeasonPhase = 'PRE' | 'REGULAR' | 'PLAYOFF' | 'OFFSEASON' | string;

export const SEASON_PHASE_LABELS: Record<string, string> = {
  PRE: 'Preseason',
  REGULAR: 'Regular Season',
  PLAYOFF: 'Playoffs',
  OFFSEASON: 'Offseason',
};

/** Header / season dashboard label with week context. */
export function seasonPhaseLabel(
  phase: SeasonPhase,
  currentWeekIndex: number,
  scheduleLength: number,
): string {
  if (phase === 'PRE') return SEASON_PHASE_LABELS.PRE;
  if (phase === 'REGULAR') {
    const week = Math.min(currentWeekIndex + 1, Math.max(scheduleLength, 1));
    return `Week ${week} of ${Math.max(scheduleLength, 12)}`;
  }
  if (phase === 'PLAYOFF') return SEASON_PHASE_LABELS.PLAYOFF;
  if (phase === 'OFFSEASON') return SEASON_PHASE_LABELS.OFFSEASON;
  return phase;
}

/** Compact home dashboard status chip. */
export function seasonPhaseHomeStatus(phase: SeasonPhase, currentWeekIndex: number): string {
  if (phase === 'REGULAR') return `Week ${currentWeekIndex + 1}`;
  return SEASON_PHASE_LABELS[phase] ?? phase;
}

/** Right-rail season status line. */
export function seasonPhaseRailLabel(phase: SeasonPhase, currentWeekIndex: number): string {
  if (phase === 'REGULAR') return `Week ${currentWeekIndex + 1} of 12`;
  if (phase === 'PLAYOFF') return 'College Lacrosse Playoff';
  return SEASON_PHASE_LABELS[phase] ?? phase;
}

/** Rankings poll week label. */
export function seasonRankingsWeekLabel(
  phase: SeasonPhase,
  completedWeeks: number,
): string {
  if (phase === 'PLAYOFF' || phase === 'OFFSEASON') return 'Final';
  if (completedWeeks > 0) return `Week ${completedWeeks}`;
  return SEASON_PHASE_LABELS.PRE;
}
