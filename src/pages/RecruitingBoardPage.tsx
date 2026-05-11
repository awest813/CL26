import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  addRecruitToBoard,
  removeRecruitFromBoard,
  setRecruitHours,
  setRecruitPitch,
  WEEKLY_HOURS_CAP,
  MAX_HOURS_PER_RECRUIT,
} from '../features/coach/coachSlice';
import { selectSeasonSummary } from '../features/season/seasonSlice';
import { buildPositionNeedByPosition, estimateRecruitFit, getTeamPitchGrade } from '../sim/recruiting';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { RecruitingPitch, RecruitMotivation } from '../types/sim';

const PITCH_LABELS: Record<RecruitingPitch, string> = {
  PLAYING_TIME: 'Play Time',
  PROXIMITY: 'Home',
  ACADEMIC: 'Academics',
  PRESTIGE: 'Prestige',
  CHAMPIONSHIP: 'Winning',
  CAMPUS_LIFE: 'Campus',
};

function MotivationIcon({ motivation }: { motivation: RecruitMotivation }) {
  const color =
    motivation.importance === 'HIGH'
      ? '#ef4444'
      : motivation.importance === 'MEDIUM'
        ? '#f59e0b'
        : '#9ca3af';
  const label = PITCH_LABELS[motivation.pitch as RecruitingPitch] ?? motivation.pitch;
  return (
    <span
      title={`${label} (${motivation.importance})`}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mr-0.5 border bg-white cursor-help"
      style={{ color, borderColor: color }}
    >
      {label.charAt(0)}
    </span>
  );
}

function RecruitingBoardPage() {
  const dispatch = useAppDispatch();
  const coach = useAppSelector((state) => state.coach);
  const teams = useAppSelector((state) => state.league.teams);
  const season = useAppSelector(selectSeasonSummary);

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');

  if (coach.onboardingStep !== 'READY' || !coach.selectedTeamId) {
    return <Navigate to="/career/setup" replace />;
  }

  const selectedTeamId = coach.selectedTeamId;
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.schoolName])), [teams]);

  const boardSet = useMemo(() => new Set(coach.boardRecruitIds), [coach.boardRecruitIds]);
  const positionNeedByPosition = useMemo(
    () => buildPositionNeedByPosition(coach.managedRoster),
    [coach.managedRoster],
  );

  const boardRecruits = useMemo(
    () =>
      coach.boardRecruitIds
        .map((id) => coach.recruitPool.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    [coach.boardRecruitIds, coach.recruitPool],
  );

  const totalHours = boardRecruits.reduce(
    (sum, r) => sum + (coach.weeklyHoursByRecruitId[r.id] ?? 0),
    0,
  );
  const hoursRemaining = WEEKLY_HOURS_CAP - totalHours;

  const boardRows = useMemo(() => {
    return [...boardRecruits]
      .map((recruit) => {
        const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : 0;
        const hours = coach.weeklyHoursByRecruitId[recruit.id] ?? 0;
        const interest = selectedTeam
          ? (recruit.interestByTeamId?.[selectedTeam.id] ?? 0)
          : 0;
        const activePitch = coach.activePitchesByRecruitId[recruit.id];
        const pitchGrade =
          selectedTeam && activePitch
            ? getTeamPitchGrade(selectedTeam, activePitch, recruit, positionNeedByPosition)
            : '-';

        const topSuitors = Object.entries(recruit.interestByTeamId ?? {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([teamId, score]) => ({
            name: teamNameById.get(teamId) ?? 'Unknown',
            score: Math.round(score),
          }));

        const dealbreakerWarning =
          selectedTeam && recruit.dealbreaker
            ? ['D', 'F'].includes(
                getTeamPitchGrade(selectedTeam, recruit.dealbreaker, recruit, positionNeedByPosition),
              )
            : false;

        return { recruit, fit, hours, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors };
      })
      .sort((a, b) => b.interest - a.interest);
  }, [boardRecruits, coach.weeklyHoursByRecruitId, coach.activePitchesByRecruitId, selectedTeam, teamNameById, positionNeedByPosition]);

  const visibleRecruits = useMemo(() => {
    return coach.recruitPool
      .filter((r) => (positionFilter === 'ALL' ? true : r.position === positionFilter))
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 60);
  }, [coach.recruitPool, positionFilter, search]);

  const committedToUserCount = coach.recruitPool.filter(
    (r) => r.committedTeamId === selectedTeamId,
  ).length;

  function onAdd(recruitId: string) {
    if (!selectedTeam) return;
    const recruit = coach.recruitPool.find((r) => r.id === recruitId);
    if (!recruit) return;
    const fit = estimateRecruitFit(recruit, selectedTeam);
    const startingInterest = Math.min(40, Math.round(fit * 0.4 + recruit.stars * 2));
    dispatch(addRecruitToBoard({ recruitId, startingInterest }));
  }

  function onHoursChange(recruitId: string, nextHours: number) {
    const current = coach.weeklyHoursByRecruitId[recruitId] ?? 0;
    const requested = Math.max(0, Math.min(MAX_HOURS_PER_RECRUIT, nextHours));
    const withoutCurrent = totalHours - current;
    const allowed = Math.min(MAX_HOURS_PER_RECRUIT, Math.max(0, WEEKLY_HOURS_CAP - withoutCurrent));
    dispatch(setRecruitHours({ recruitId, hours: Math.min(requested, allowed) }));
  }

  if (coach.recruitPool.length === 0) {
    return (
      <div className="pageStack">
        <div className="pageHeader">
          <h2>Recruiting Board</h2>
          <p className="pageHeader-sub">Start recruiting to manage your prospect pool.</p>
        </div>
        <div className="card text-center py-10">
          <p className="text-gray-500 mb-4">No recruit pool loaded yet.</p>
          <Link to="/career" className="btn btn-primary">
            Go to Coach Office to start recruiting →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pageStack">
      <div className="pageHeader">
        <h2>Recruiting Board</h2>
        <p className="pageHeader-sub">
          Week {coach.recruitingWeekIndex} · {season.year} Class ·{' '}
          {committedToUserCount} committed · {coach.scholarshipsAvailable} scholarships available
        </p>
      </div>

      {/* ── Summary bar ── */}
      <div className="card">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Board size</div>
            <div className="font-bold">{boardRecruits.length} / 25</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Hours used</div>
            <div
              className="font-bold"
              style={{ color: hoursRemaining < 0 ? '#dc2626' : '#15803d' }}
            >
              {totalHours} / {WEEKLY_HOURS_CAP}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Committed</div>
            <div className="font-bold">{committedToUserCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase mb-0.5">Scholarships left</div>
            <div className="font-bold">{coach.scholarshipsAvailable}</div>
          </div>
          <div className="ml-auto self-center">
            <Link to="/career/week" className="btn text-sm">
              ← Weekly Hub
            </Link>
          </div>
        </div>

        {/* Position need indicators */}
        {positionNeedByPosition && (
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
            {Object.entries(positionNeedByPosition).map(([pos, need]) => (
              <span
                key={pos}
                className="text-xs px-2 py-0.5 rounded-full border font-semibold"
                style={{
                  borderColor: need > 0 ? '#f59e0b' : '#d1d5db',
                  color: need > 0 ? '#92400e' : '#6b7280',
                  background: need > 0 ? '#fef3c7' : '#f9fafb',
                }}
              >
                {pos}: {need > 0 ? `need ${need}` : 'full'}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid2">
        {/* ── Target list ── */}
        <div className="card">
          <h3 className="text-base font-bold m-0 mb-3">
            Target List ({boardRows.length}/25)
          </h3>

          {boardRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
              <p className="mb-1">Your board is empty.</p>
              <p className="text-sm">Add prospects from the pool on the right.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-2 pr-2">Recruit</th>
                    <th className="pb-2 pr-2">Competition</th>
                    <th className="pb-2 pr-2">Pitch</th>
                    <th className="pb-2 w-24">Interest</th>
                    <th className="pb-2 text-right">Hrs</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {boardRows.map(({ recruit, interest, activePitch, pitchGrade, dealbreakerWarning, topSuitors }) => (
                    <tr key={recruit.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-2">
                        <div className="font-semibold flex items-center gap-1">
                          {recruit.name}
                          {dealbreakerWarning && (
                            <span title="Dealbreaker Warning" className="text-red-500 cursor-help">⚠</span>
                          )}
                          {recruit.committedTeamId === selectedTeamId && (
                            <span className="text-xs text-green-600 font-bold">✓</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {'★'.repeat(recruit.stars)} {recruit.position} · {recruit.region}
                        </div>
                        <div className="flex mt-0.5">
                          {recruit.motivations?.map((m, i) => (
                            <MotivationIcon key={i} motivation={m} />
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="text-xs space-y-0.5">
                          {topSuitors.map((s, i) => (
                            <div
                              key={i}
                              className={`flex justify-between ${
                                s.name === selectedTeam?.schoolName
                                  ? 'font-bold text-blue-700'
                                  : 'text-gray-500'
                              }`}
                            >
                              <span className="truncate max-w-[90px]" title={s.name}>
                                {s.name}
                              </span>
                              <span className="ml-1">{s.score}%</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={activePitch ?? ''}
                          onChange={(e) =>
                            dispatch(
                              setRecruitPitch({
                                recruitId: recruit.id,
                                pitch: e.target.value as RecruitingPitch,
                              }),
                            )
                          }
                          className="text-xs p-1 border rounded w-full mb-1"
                        >
                          <option value="">No Pitch</option>
                          {Object.entries(PITCH_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {activePitch && (
                          <div
                            className={`text-xs font-bold text-center ${
                              pitchGrade.startsWith('A')
                                ? 'text-green-600'
                                : pitchGrade === 'F'
                                  ? 'text-red-600'
                                  : 'text-gray-600'
                            }`}
                          >
                            Grade: {pitchGrade}
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-0.5">
                          <div
                            className={`h-1.5 rounded-full ${interest >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, interest)}%` }}
                          />
                        </div>
                        <div className="text-xs text-center text-gray-500">{interest}%</div>
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={MAX_HOURS_PER_RECRUIT}
                          value={coach.weeklyHoursByRecruitId[recruit.id] ?? 0}
                          onChange={(e) => onHoursChange(recruit.id, Number(e.target.value) || 0)}
                          className="w-12 p-1 border rounded text-center text-sm"
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <button
                          className="text-xs text-red-500 hover:underline bg-transparent border-0 cursor-pointer"
                          onClick={() => dispatch(removeRecruitFromBoard(recruit.id))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Prospect pool ── */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-bold m-0">Prospect Pool</h3>
            <button
              className="text-xs text-blue-600 hover:underline bg-transparent border-0 cursor-pointer"
              onClick={() => { setSearch(''); setPositionFilter('ALL'); }}
            >
              Reset Filters
            </button>
          </div>

          <div className="flex gap-2 mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name…"
              className="flex-1 p-1.5 text-sm border rounded"
            />
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="p-1.5 text-sm border rounded w-20"
            >
              <option value="ALL">All</option>
              <option value="A">A</option>
              <option value="M">M</option>
              <option value="D">D</option>
              <option value="LSM">LSM</option>
              <option value="FO">FO</option>
              <option value="G">G</option>
            </select>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '560px' }}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-400">
                  <th className="p-2">Name</th>
                  <th className="p-2">Rtg</th>
                  <th className="p-2">Fit</th>
                  <th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecruits.map((recruit) => {
                  const isCommittedElsewhere = Boolean(
                    recruit.committedTeamId && recruit.committedTeamId !== selectedTeamId,
                  );
                  const isCommittedToMe = recruit.committedTeamId === selectedTeamId;
                  const onBoard = boardSet.has(recruit.id);
                  const fit = selectedTeam ? estimateRecruitFit(recruit, selectedTeam) : '-';

                  return (
                    <tr
                      key={recruit.id}
                      className={`border-b hover:bg-gray-50 ${isCommittedToMe ? 'bg-green-50' : ''}`}
                    >
                      <td className="p-2">
                        <div className="font-semibold">{recruit.name}</div>
                        <div className="text-xs text-gray-500">
                          {recruit.position} · {recruit.region}
                        </div>
                        {isCommittedElsewhere && (
                          <div className="text-xs text-red-500">
                            Committed: {teamNameById.get(recruit.committedTeamId!) ?? 'Other'}
                          </div>
                        )}
                        {isCommittedToMe && (
                          <div className="text-xs text-green-600 font-bold">Committed!</div>
                        )}
                      </td>
                      <td className="p-2 text-yellow-500 text-xs">{'★'.repeat(recruit.stars)}</td>
                      <td className="p-2 font-mono text-xs">{fit}</td>
                      <td className="p-2 text-right">
                        {onBoard ? (
                          <button
                            className="text-xs text-red-500 hover:underline bg-transparent border-0 cursor-pointer"
                            onClick={() => dispatch(removeRecruitFromBoard(recruit.id))}
                          >
                            Remove
                          </button>
                        ) : (
                          !isCommittedElsewhere && !isCommittedToMe && (
                            <button
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 cursor-pointer"
                              onClick={() => onAdd(recruit.id)}
                              disabled={boardSet.size >= 25}
                            >
                              Add
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleRecruits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">
                      No recruits found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RecruitingBoardPage;
