import type { RecruitingReport } from '../features/coach/coachSlice';
import type { Recruit, Team } from '../types/sim';

type RecruitingReportNoteProps = {
  report: RecruitingReport | null | undefined;
  recruitPool: Recruit[];
  teams: Team[];
};

function RecruitingReportNote({ report, recruitPool, teams }: RecruitingReportNoteProps) {
  if (!report) return null;
  const recruitName = (id: string) => recruitPool.find((r) => r.id === id)?.name ?? 'A target';
  const schoolName = (id: string) => teams.find((t) => t.id === id)?.schoolName ?? 'another program';
  const otherCommits = report.totalCommits - report.committedToUserIds.length - report.lostTargets.length;

  return (
    <div className="text-sm" aria-live="polite">
      <div className="text-xs text-gray-400 uppercase mb-0.5">Period {report.period} on the trail</div>
      {report.committedToUserIds.length > 0 && (
        <div className="text-green-600 font-semibold">
          Committed to you: {report.committedToUserIds.map(recruitName).join(', ')}
        </div>
      )}
      {report.lostTargets.map(({ recruitId, teamId }) => (
        <div key={recruitId} className="text-red-500">
          Lost {recruitName(recruitId)} to {schoolName(teamId)}
        </div>
      ))}
      <div className="text-xs text-gray-500">
        {otherCommits > 0
          ? `${otherCommits} other ${otherCommits === 1 ? 'prospect' : 'prospects'} committed elsewhere.`
          : report.totalCommits === 0
            ? 'No commitments this period.'
            : 'No other commitments this period.'}
      </div>
    </div>
  );
}

export default RecruitingReportNote;
